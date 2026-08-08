import dgram from 'dgram';

const SERVER_QUERY_TIMEOUT = 3000;

/**
 * Query a single game server for detailed info using A2S_INFO protocol
 */
export async function queryServerInfo(ip, port) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const timeout = setTimeout(() => {
      socket.close();
      resolve(null);
    }, SERVER_QUERY_TIMEOUT);

    socket.on('error', () => {
      clearTimeout(timeout);
      socket.close();
      resolve(null);
    });

    socket.on('message', (msg) => {
      clearTimeout(timeout);
      try {
        const info = parseA2SInfoResponse(msg);
        info.ip = ip;
        info.port = port;
        info.queryPort = port;
        socket.close();
        resolve(info);
      } catch (e) {
        socket.close();
        resolve(null);
      }
    });

    // A2S_INFO query packet
    // Header: 0xFFFFFFFF + 'T' (0x54) + "Source Engine Query\0"
    const query = Buffer.from([
      0xFF, 0xFF, 0xFF, 0xFF, 0x54,
      ...Buffer.from('Source Engine Query\0'),
    ]);

    socket.send(query, port, ip);
  });
}

/**
 * Parse A2S_INFO response
 */
export function parseA2SInfoResponse(buffer) {
  let offset = 4; // Skip header (0xFFFFFFFF)

  const header = buffer.readUInt8(offset++);

  // Check for challenge response (0x41 = 'A')
  if (header === 0x41) {
    // Server sent a challenge, we'd need to resend with the challenge
    // For simplicity, we'll skip servers that require challenges
    throw new Error('Challenge required');
  }

  // 'I' (0x49) = Source server info response
  // 'm' (0x6D) = Obsolete GoldSource response
  if (header !== 0x49 && header !== 0x6D) {
    throw new Error('Invalid response header');
  }

  const info = {};

  // Protocol version
  info.protocol = buffer.readUInt8(offset++);

  // Read null-terminated strings
  const readString = () => {
    const start = offset;
    while (buffer[offset] !== 0 && offset < buffer.length) offset++;
    const str = buffer.toString('utf8', start, offset);
    offset++; // Skip null terminator
    return str;
  };

  info.name = readString();
  info.map = readString();
  info.folder = readString();
  info.game = readString();

  // Steam App ID (short)
  info.appId = buffer.readUInt16LE(offset);
  offset += 2;

  // Players
  info.players = buffer.readUInt8(offset++);
  info.maxPlayers = buffer.readUInt8(offset++);
  info.bots = buffer.readUInt8(offset++);

  // Server type: 'd' = dedicated, 'l' = listen, 'p' = SourceTV
  info.serverType = String.fromCharCode(buffer.readUInt8(offset++));

  // Environment: 'l' = Linux, 'w' = Windows, 'm'/'o' = Mac
  info.environment = String.fromCharCode(buffer.readUInt8(offset++));

  // Visibility: 0 = public, 1 = private
  info.visibility = buffer.readUInt8(offset++);
  info.isPrivate = info.visibility === 1;

  // VAC: 0 = unsecured, 1 = secured
  info.vac = buffer.readUInt8(offset++);

  // Version
  info.version = readString();

  // Extra data flag (EDF)
  if (offset < buffer.length) {
    const edf = buffer.readUInt8(offset++);

    // Port
    if (edf & 0x80) {
      info.gamePort = buffer.readUInt16LE(offset);
      offset += 2;
    }

    // Steam ID
    if (edf & 0x10) {
      // 64-bit Steam ID
      offset += 8;
    }

    // SourceTV
    if (edf & 0x40) {
      info.sourceTvPort = buffer.readUInt16LE(offset);
      offset += 2;
      info.sourceTvName = readString();
    }

    // Keywords/Tags
    if (edf & 0x20) {
      info.keywords = readString();
    }

    // Game ID
    if (edf & 0x01) {
      // 64-bit Game ID
      offset += 8;
    }
  }

  return info;
}
