import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';

const log = createLogger('API:Scheduler');
const router = express.Router();

// Get scheduler status
router.get('/status', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const status = scheduler.getStatus();
    res.json(status);
  } catch (error) {
    log.error(`Failed to get scheduler status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
