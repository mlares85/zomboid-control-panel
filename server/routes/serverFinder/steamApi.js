import { createLogger } from '../../utils/logger.js';

const log = createLogger('API:Finder');

// Project Zomboid App ID on Steam
export const PZ_APP_ID = 108600;

// Simple in-memory cache for server list
export let serverCache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 1 minute cache
};

/**
 * Alternative: Use Steam Web API to get server list
 * Requires steamApiKey from settings database
 * Makes parallel requests with different filters to get more servers
 */
export async function getServersFromSteamAPI(apiKey, useCache = true) {
  if (!apiKey) {
    throw new Error('Steam API Key not configured in Settings');
  }

  // Check cache
  if (useCache && serverCache.data && (Date.now() - serverCache.timestamp) < serverCache.ttl) {
    log.debug(`Returning ${serverCache.data.length} servers from cache`);
    return serverCache.data;
  }

  const allServers = new Map(); // Use Map to deduplicate by addr

  // Different filters to maximize server coverage (run in parallel)
  const baseFilters = [
    `\\appid\\${PZ_APP_ID}`, // All servers (up to limit)
    `\\appid\\${PZ_APP_ID}\\white\\1`, // Whitelisted servers
    `\\appid\\${PZ_APP_ID}\\full\\1`, // Full servers (might be missed otherwise)
  ];

  const fetchWithFilter = async (filter) => {
    try {
      const url = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${apiKey}&filter=${encodeURIComponent(filter)}&limit=10000`;
      const response = await fetch(url);
      if (!response.ok) {
        log.warn(`Steam API request failed for filter ${filter}: ${response.status}`);
        return [];
      }
      const data = await response.json();
      return data.response?.servers || [];
    } catch (error) {
      log.warn(`Steam API request failed for filter ${filter}:`, error.message);
      return [];
    }
  };

  // Fetch all filters in parallel
  const results = await Promise.all(baseFilters.map(fetchWithFilter));

  // Merge and deduplicate
  for (const servers of results) {
    for (const server of servers) {
      if (server.addr) {
        allServers.set(server.addr, server);
      }
    }
  }

  log.info(`Steam API returned ${allServers.size} unique servers`);

  // Update cache
  const serverArray = Array.from(allServers.values());
  serverCache = {
    data: serverArray,
    timestamp: Date.now(),
    ttl: 60000,
  };

  return serverArray;
}
