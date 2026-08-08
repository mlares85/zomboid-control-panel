import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { getScheduledTasks } from '../../database/init.js';

const log = createLogger('API:Scheduler');
const router = express.Router();

// Run a scheduled task on demand. Goes through Scheduler.runTaskNow() — the
// same dispatch a cron fire uses — so special commands (restart/save/
// servermsg/bridge:) are handled correctly instead of being sent to RCON as
// a literal string. A restart can run for several minutes (warning
// countdown), so this fires in the background and returns immediately;
// completion shows up in the schedule history.
router.post('/tasks/:id/run', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');
    const { id } = req.params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const tasks = await getScheduledTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    log.info(`POST /tasks/${taskId}/run: ${task.name}`);
    scheduler.runTaskNow(task).catch(err => {
      log.error(`Manual run of task ${taskId} failed: ${err.message}`);
    });

    res.json({ success: true, message: 'Task triggered' });
  } catch (error) {
    log.error(`Failed to run scheduled task: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
