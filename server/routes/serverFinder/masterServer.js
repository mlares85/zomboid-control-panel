import dgram from 'dgram';

// Steam Master Server addresses
export const MASTER_SERVERS = [
  { host: 'hl2master.steampowered.com', port: 27011 },
];

// Timeout for queries (ms)
const QUERY_TIMEOUT = 10000;

/**
 * Query Steam Master Server for game servers
 */
export async function queryMasterServer(masterHost, masterPort, region = 0xFF, filters = '') {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const servers = [];
    let lastIp = '0.0.0.0';
    let lastPort = 0;

    const timeout = setTimeout(() => {
      socket.close();
      resolve(servers);
    }, QUERY_TIMEOUT);

    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    socket.on('message', (msg) => {
      // Parse response
      // Header: 0xFF 0xFF 0xFF 0xFF 0x66 0x0A
      if (msg.length < 6) return;

      let offset = 6;
      while (offset + 6 <= msg.length) {
        const ip = `${msg[offset]}.${msg[offset + 1]}.${msg[offset + 2]}.${msg[offset + 3]}`;
        const port = msg.readUInt16BE(offset + 4);
        offset += 6;

        // 0.0.0.0:0 marks end of list
        if (ip === '0.0.0.0' && port === 0) {
          clearTimeout(timeout);
          socket.close();
          resolve(servers);
          return;
        }

        servers.push({ ip, port });
        lastIp = ip;
        lastPort = port;
      }

      // Request more servers if list continues
      if (servers.length > 0) {
        sendQuery(lastIp, lastPort);
      }
    });

    const sendQuery = (seedIp = '0.0.0.0', seedPort = 0) => {
      // Master Server Query packet
      // Type: 0x31
      // Region: 0xFF (all regions)
      // IP:Port seed
      // Filter string
      const seedAddr = `${seedIp}:${seedPort}`;
      const filterStr = filters + '\0';

      const packet = Buffer.alloc(2 + seedAddr.length + 1 + filterStr.length);
      let offset = 0;

      packet.writeUInt8(0x31, offset++); // Query type
      packet.writeUInt8(region, offset++); // Region

      // Seed address
      Buffer.from(seedAddr).copy(packet, offset);
      offset += seedAddr.length;
      packet.writeUInt8(0, offset++); // Null terminator

      // Filter
      Buffer.from(filterStr).copy(packet, offset);

      socket.send(packet, masterPort, masterHost);
    };

    sendQuery();
  });
}
