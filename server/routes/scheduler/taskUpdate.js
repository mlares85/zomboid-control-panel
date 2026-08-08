import express from 'express';
import cron from 'node-cron';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import {
  updateScheduledTask,
  deleteScheduledTask,
  getServer
} from '../../database/init.js';
import { isCronTooFrequent } from './cronHelpers.js';

const log = createLogger('API:Scheduler');
const router = express.Router();

// Update a scheduled task
router.put('/tasks/:id', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const { id } = req.params;
    const { name, cronExpression, command, enabled, serverId } = req.body;
    log.info(`PUT /tasks/${id}: name=${name}, cron=${cronExpression}, enabled=${enabled}, serverId=${serverId}`);

    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Validate name and command length
    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return res.status(400).json({ error: 'Invalid task name (max 100 characters)' });
    }
    if (command !== undefined && (typeof command !== 'string' || command.length > 2000)) {
      return res.status(400).json({ error: 'Invalid command (max 2000 characters)' });
    }

    // Validate cron expression before saving to prevent DB/scheduler inconsistency
    if (cronExpression && !cron.validate(cronExpression)) {
      return res.status(400).json({ error: 'Invalid cron expression. Use format: minute hour day month weekday (e.g., "0 */6 * * *" for every 6 hours)' });
    }

    // Security: Reject tasks that run more frequently than every 5 minutes to prevent DoS
    if (cronExpression && isCronTooFrequent(cronExpression)) {
      return res.status(400).json({ error: 'Tasks cannot run more frequently than every 5 minutes' });
    }

    // Validate the target server, if reassignment was requested
    if (serverId !== undefined && serverId !== null) {
      const target = await getServer(serverId);
      if (!target) {
        return res.status(400).json({ error: 'Target server not found' });
      }
    }

    const updated = await updateScheduledTask(taskId, name, cronExpression, command, enabled, serverId);
    if (!updated) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Reschedule from the merged record, not the request body: a partial update
    // (e.g. the enable/disable toggle) would otherwise re-arm the job without
    // its pinned server and run it against whichever server is active.
    if (enabled) {
      try {
        scheduler.scheduleTask({
          id: taskId,
          name: updated.name,
          cron_expression: updated.cron_expression,
          command: updated.command,
          server_id: updated.server_id,
          enabled: 1
        });
      } catch (schedErr) {
        log.error(`Failed to reschedule task ${taskId}, reverting DB: ${schedErr.message}`);
        // Revert: re-save the old enabled state to avoid phantom active task in DB
        await updateScheduledTask(taskId, undefined, undefined, undefined, 0).catch(err => log.debug(`Failed to revert task ${taskId}: ${err.message}`));
        return res.status(500).json({ error: 'Failed to reschedule task: ' + sanitizeError(schedErr.message) });
      }
    } else {
      scheduler.cancelTask(taskId);
    }

    res.json({ success: true, message: 'Task updated' });
  } catch (error) {
    log.error(`Failed to update scheduled task: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Delete a scheduled task
router.delete('/tasks/:id', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const { id } = req.params;
    log.info(`DELETE /tasks/${id}`);

    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    scheduler.cancelTask(taskId);
    await deleteScheduledTask(taskId);

    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    log.error(`Failed to delete scheduled task: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
