import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { getScheduleHistory, clearScheduleHistory } from '../../database/init.js';

const log = createLogger('API:Scheduler');
const router = express.Router();

// Get schedule execution history
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const taskId = req.query.taskId ? parseInt(req.query.taskId, 10) : null;
    const history = await getScheduleHistory(limit, taskId);
    res.json({ history });
  } catch (error) {
    log.error(`Failed to get schedule history: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear schedule execution history
router.delete('/history', async (req, res) => {
  try {
    await clearScheduleHistory();
    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    log.error(`Failed to clear schedule history: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
