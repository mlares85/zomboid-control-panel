import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { getSteamApiKey } from '../../services/steamApiKey.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { queryServerInfo } from './a2s.js';
import { queryMasterServer, MASTER_SERVERS } from './masterServer.js';
import { PZ_APP_ID, serverCache, getServersFromSteamAPI } from './steamApi.js';

const log = createLogger('API:Finder');
const router = express.Router();

// Map a Steam API server entry to our normalized shape.
function mapSteamApiServer(s) {
  // Parse gametype for version and tags
  // Format: "hidden;hosted;vanilla;pvp;VERSION:42.13"
  const gametype = s.gametype || '';
  const tags = gametype.split(';').filter(t => t && !t.startsWith('VERSION:'));
  const versionMatch = gametype.match(/VERSION:([0-9.]+)/);
  const gameVersion = versionMatch ? versionMatch[1] : '';

  // Safely parse IP and port from addr (format: "ip:port")
  const addrParts = s.addr?.split(':') || [];
  const ip = addrParts[0] || '';
  const portFromAddr = addrParts[1] ? parseInt(addrParts[1], 10) : NaN;
  const port = !isNaN(portFromAddr) ? portFromAddr : (s.gameport || 16261);

  return {
    name: s.name || 'Unknown',
    ip,
    port,
    gamePort: s.gameport,
    players: s.players || 0,
    maxPlayers: s.max_players || 0,
    map: s.map || 'Muldraugh, KY',
    version: gameVersion, // Actual game version from gametype
    vac: s.secure || false,
    isPrivate: s.password || false,
    os: s.os === 'l' ? 'Linux' : s.os === 'w' ? 'Windows' : 'Unknown',
    dedicated: s.dedicated || true,
    bots: s.bots || 0,
    steamId: s.steamid,
    gamedir: s.gamedir,
    keywords: gametype, // Full gametype string
    tags: tags, // Parsed tags array (hidden, hosted, vanilla, pvp, etc.)
    ping: null, // Not available from API
  };
}

// Fallback to master server query (less reliable but works without API key)
async function queryViaMasterServer() {
  const servers = [];
  const filter = `\\appid\\${PZ_APP_ID}`;

  for (const master of MASTER_SERVERS) {
    try {
      const masterServers = await queryMasterServer(master.host, master.port, 0xFF, filter);

      // Query each server for details (limit concurrent queries)
      const batchSize = 50;
      for (let i = 0; i < masterServers.length; i += batchSize) {
        const batch = masterServers.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(s => queryServerInfo(s.ip, s.port))
        );

        servers.push(...results.filter(Boolean));
      }

      if (servers.length > 0) break;
    } catch (e) {
      log.warn(`Master server ${master.host} query failed:`, e.message);
    }
  }

  return servers;
}

/**
 * Get server list - tries Steam API first, falls back to master server query
 */
router.get('/', async (req, res) => {
  try {
    log.info(`GET / (server finder): refresh=${req.query.refresh || 'false'}`);
    let servers = [];
    let source = 'steam_api';
    const steamApiKey = await getSteamApiKey();
    let apiKeyConfigured = !!steamApiKey;
    const forceRefresh = req.query.refresh === 'true';
    let cached = false;

    // Try Steam Web API first (more reliable)
    if (steamApiKey) {
      try {
        // Check if using cache
        if (!forceRefresh && serverCache.data && (Date.now() - serverCache.timestamp) < serverCache.ttl) {
          cached = true;
        }
        const apiServers = await getServersFromSteamAPI(steamApiKey, !forceRefresh);
        servers = apiServers.map(mapSteamApiServer);

        log.info(`Found ${servers.length} PZ servers via Steam API`);
      } catch (apiError) {
        log.warn('Steam API failed, trying master server query:', apiError.message);
        source = 'master_server';
      }
    }

    // Fallback to master server query (less reliable but works without API key)
    if (servers.length === 0) {
      source = 'master_server';
      try {
        servers = await queryViaMasterServer();
        log.info(`Found ${servers.length} PZ servers via master server`);
      } catch (masterError) {
        log.error('Master server query failed:', masterError.message);
      }
    }

    // Sort by player count (descending)
    servers.sort((a, b) => (b.players || 0) - (a.players || 0));

    // Calculate statistics
    const totalPlayers = servers.reduce((sum, s) => sum + (s.players || 0), 0);
    const activeServers = servers.filter(s => s.players > 0).length;
    const totalCapacity = servers.reduce((sum, s) => sum + (s.maxPlayers || 0), 0);

    res.json({
      success: true,
      source,
      cached,
      count: servers.length,
      totalPlayers,
      activeServers,
      totalCapacity,
      servers, // Return ALL servers, frontend handles pagination
      apiKeyConfigured,
    });
  } catch (error) {
    log.error('Failed to get server list:', error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error.message),
    });
  }
});

export default router;
