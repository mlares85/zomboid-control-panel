import express from 'express';
import cron from 'node-cron';
import { sanitizeError } from '../../utils/sanitize.js';
import { hasUnsupportedCronFieldCount } from './cronHelpers.js';

const router = express.Router();

// Validate cron expression
router.post('/validate-cron', async (req, res) => {
  try {
    const { cronExpression } = req.body;
    if (!cronExpression) {
      return res.status(400).json({ valid: false, error: 'cronExpression is required' });
    }

    const isValid = cron.validate(cronExpression);
    if (!isValid) {
      return res.json({ valid: false, error: 'Invalid cron expression format' });
    }

    // Keep this preview endpoint's verdict consistent with what POST /tasks
    // and PUT /tasks/:id will actually accept -- without this, a 6-field
    // expression previews as valid here and then gets refused on submit.
    if (hasUnsupportedCronFieldCount(cronExpression)) {
      return res.json({
        valid: false,
        error: 'The panel does not support seconds-precision schedules. Use exactly 5 fields: minute hour day month weekday.',
      });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ valid: false, error: sanitizeError(error.message) });
  }
});

// Common cron presets for convenience
router.get('/cron-presets', (req, res) => {
  res.json({
    presets: [
      { name: 'Every hour', cron: '0 * * * *' },
      { name: 'Every 2 hours', cron: '0 */2 * * *' },
      { name: 'Every 4 hours', cron: '0 */4 * * *' },
      { name: 'Every 6 hours', cron: '0 */6 * * *' },
      { name: 'Every 12 hours', cron: '0 */12 * * *' },
      { name: 'Daily at midnight', cron: '0 0 * * *' },
      { name: 'Daily at 6 AM', cron: '0 6 * * *' },
      { name: 'Daily at noon', cron: '0 12 * * *' },
      { name: 'Daily at 6 PM', cron: '0 18 * * *' },
      { name: 'Every 30 minutes', cron: '*/30 * * * *' },
      { name: 'Every 15 minutes', cron: '*/15 * * * *' }
    ]
  });
});

export default router;
