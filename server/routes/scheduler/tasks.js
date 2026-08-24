import express from 'express';
import cron from 'node-cron';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import {
  getScheduledTasks,
  createScheduledTask,
  deleteScheduledTask,
  getActiveServer,
  getServer
} from '../../database/init.js';
import { isCronTooFrequent, hasUnsupportedCronFieldCount } from './cronHelpers.js';

const log = createLogger('API:Scheduler');
const router = express.Router();

// Get all scheduled tasks
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await getScheduledTasks();
    res.json({ tasks });
  } catch (error) {
    log.error(`Failed to get scheduled tasks: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Create a new scheduled task
router.post('/tasks', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const { name, cronExpression, command, serverId } = req.body;
    log.info(`POST /tasks: name=${name}, cron=${cronExpression}, command=${(command || '').substring(0, 80)}, serverId=${serverId}`);

    if (!name || !cronExpression || !command) {
      return res.status(400).json({ error: 'Name, cronExpression, and command are required' });
    }

    // Validate input types and lengths
    if (typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ error: 'Invalid task name (max 100 chars)' });
    }
    if (typeof command !== 'string' || command.length > 2000) {
      return res.status(400).json({ error: 'Invalid command (max 2000 chars)' });
    }
    if (typeof cronExpression !== 'string' || cronExpression.length > 100) {
      return res.status(400).json({ error: 'Invalid cron expression format' });
    }

    // Validate cron expression before saving
    if (!cron.validate(cronExpression)) {
      return res.status(400).json({ error: 'Invalid cron expression. Use format: minute hour day month weekday (e.g., "0 */6 * * *" for every 6 hours)' });
    }

    // The panel does not support seconds-precision (6-field) schedules --
    // see hasUnsupportedCronFieldCount()'s comment for why this must be
    // checked before isCronTooFrequent, not folded into it.
    if (hasUnsupportedCronFieldCount(cronExpression)) {
      return res.status(400).json({ error: 'The panel does not support seconds-precision schedules. Use exactly 5 fields: minute hour day month weekday (e.g., "0 */6 * * *").' });
    }

    // Security: Reject tasks that run more frequently than every 5 minutes to prevent DoS
    if (isCronTooFrequent(cronExpression)) {
      return res.status(400).json({ error: 'Tasks cannot run more frequently than every 5 minutes' });
    }

    // Validate the target server exists, if one was explicitly given —
    // createScheduledTask() falls back to the active server when omitted.
    let resolvedServerId = serverId ?? null;
    if (resolvedServerId) {
      const target = await getServer(resolvedServerId);
      if (!target) {
        return res.status(400).json({ error: 'Target server not found' });
      }
    } else {
      const active = await getActiveServer();
      resolvedServerId = active ? active.id : null;
    }

    const result = await createScheduledTask(name, cronExpression, command, resolvedServerId);
    const task = {
      id: result.id,
      name,
      cron_expression: cronExpression,
      command,
      server_id: resolvedServerId,
      enabled: 1
    };

    // Schedule the task — rollback DB entry if scheduling fails
    try {
      scheduler.scheduleTask(task);
    } catch (schedErr) {
      log.error(`Failed to schedule task, rolling back DB entry: ${schedErr.message}`);
      await deleteScheduledTask(result.id);
      return res.status(500).json({ error: 'Failed to schedule task: ' + sanitizeError(schedErr.message) });
    }

    res.json({ success: true, task });
  } catch (error) {
    log.error(`Failed to create scheduled task: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
