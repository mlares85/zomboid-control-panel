// ============================================
// Player Stats (playtime tracking)
// ============================================
import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { getPlayerStats, getPlayerStat } from '../../database/init.js';
import { sanitizeError } from '../../utils/sanitize.js';

const log = createLogger('API:Players');
const router = express.Router();

// Get all player stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await getPlayerStats();
    res.json({ success: true, stats });
  } catch (error) {
    log.error(`Failed to get player stats: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get stats for specific player
router.get('/stats/:playerName', async (req, res) => {
  try {
    const stat = await getPlayerStat(req.params.playerName);
    res.json({ success: true, stat });
  } catch (error) {
    log.error(`Failed to get player stat: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
