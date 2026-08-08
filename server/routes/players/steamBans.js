import express from 'express';
import { createLogger } from '../../utils/logger.js';
import {
  logPlayerAction,
  getSteamIdBans,
  addSteamIdBan,
  removeSteamIdBan,
} from '../../database/init.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { isValidText } from './validators.js';

const log = createLogger('API:Players');
const router = express.Router();

// Get banned SteamIDs
router.get('/steamid-bans', async (req, res) => {
  try {
    const bans = await getSteamIdBans();
    res.json({ bans });
  } catch (error) {
    log.error(`Failed to get SteamID bans: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Ban by SteamID
router.post('/banid', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { steamId, reason } = req.body;
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';

    if (!steamId) {
      return res.status(400).json({ error: 'SteamID is required' });
    }

    // SteamIDs are numeric strings
    if (!/^\d{17}$/.test(steamId)) {
      return res.status(400).json({ error: 'Invalid SteamID format (must be 17 digits)' });
    }

    if (normalizedReason && !isValidText(normalizedReason)) {
      return res.status(400).json({ error: 'Invalid reason format' });
    }

    const result = await rconService.banSteamId(steamId);
    log.info(`POST /banid: SteamID ${steamId}`);
    await addSteamIdBan(steamId, normalizedReason || null);
    await logPlayerAction(steamId, 'banid', normalizedReason || null);

    res.json(result);
  } catch (error) {
    log.error(`Failed to ban SteamID: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Unban by SteamID
router.post('/unbanid', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { steamId } = req.body;

    if (!steamId) {
      return res.status(400).json({ error: 'SteamID is required' });
    }

    if (!/^\d{17}$/.test(steamId)) {
      return res.status(400).json({ error: 'Invalid SteamID format (must be 17 digits)' });
    }

    const result = await rconService.unbanSteamId(steamId);
    log.info(`POST /unbanid: SteamID ${steamId}`);
    await removeSteamIdBan(steamId);
    await logPlayerAction(steamId, 'unbanid', null);

    res.json(result);
  } catch (error) {
    log.error(`Failed to unban SteamID: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
