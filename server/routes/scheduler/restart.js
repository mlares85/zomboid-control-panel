import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { getActiveServer } from '../../database/init.js';

const log = createLogger('API:Scheduler');
const router = express.Router();

// Trigger immediate restart
router.post('/restart-now', async (req, res) => {
  try {
    const activeServer = await getActiveServer();
    if (activeServer?.isRemote) {
      return res.status(400).json({ error: 'Cannot restart a remote server. The process is not managed by this panel.' });
    }

    const scheduler = req.app.get('scheduler');
    const { warningMinutes } = req.body;

    // Parse and validate warningMinutes (0-60 range)
    let parsedWarningMinutes = parseInt(warningMinutes, 10);
    log.info(`POST /restart-now: warningMinutes=${warningMinutes}`);
    if (isNaN(parsedWarningMinutes) || parsedWarningMinutes < 0) {
      parsedWarningMinutes = 5; // Default
    } else if (parsedWarningMinutes > 60) {
      parsedWarningMinutes = 60; // Cap at 60 minutes
    }

    // Run restart in background, passing warningMinutes directly
    scheduler.performRestart(parsedWarningMinutes).catch(err => {
      log.error(`Restart failed: ${err.message}`);
    });

    res.json({ success: true, message: 'Restart initiated' });
  } catch (error) {
    log.error(`Failed to trigger restart: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
