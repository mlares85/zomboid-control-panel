import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { getPlayerLogs } from '../../database/init.js';
import { sanitizeError } from '../../utils/sanitize.js';

const log = createLogger('API:Players');
const router = express.Router();

// Get player activity logs
router.get('/activity', async (req, res) => {
  try {
    const { player, limit = 100 } = req.query;
    const logs = await getPlayerLogs(player || null, parseInt(limit, 10));
    res.json({ success: true, logs });
  } catch (error) {
    log.error(`Failed to get player activity logs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get all connected players
router.get('/', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const result = await rconService.getPlayers();

    const io = req.app.get('io');
    if (io && result.success) {
      io.to('players').emit('players:update', result.players);
    }

    res.json(result);
  } catch (error) {
    log.error(`Failed to get players: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
