import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { getSteamApiKey } from '../../services/steamApiKey.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { PZ_APP_ID } from './steamApi.js';

const log = createLogger('API:Finder');
const router = express.Router();

/**
 * Debug endpoint - get raw Steam API data for a sample of servers
 */
router.get('/debug', async (req, res) => {
  try {
    const steamApiKey = await getSteamApiKey();
    if (!steamApiKey) {
      return res.status(400).json({ error: 'Steam API key not configured' });
    }

    // Get just a few servers with raw data
    const url = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${steamApiKey}&filter=\\appid\\${PZ_APP_ID}\\noplayers\\0&limit=10`;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(500).json({ error: `Steam API error: ${response.status}` });
    }

    const data = await response.json();
    const servers = data.response?.servers || [];

    res.json({
      success: true,
      count: servers.length,
      rawServers: servers,
      fieldNames: servers.length > 0 ? Object.keys(servers[0]) : [],
    });
  } catch (error) {
    log.error('Debug endpoint error:', error);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
