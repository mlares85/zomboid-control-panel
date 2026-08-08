import express from 'express';
import statusRoutes from './status.js';
import tasksRoutes from './tasks.js';
import taskUpdateRoutes from './taskUpdate.js';
import taskRunRoutes from './taskRun.js';
import restartRoutes from './restart.js';
import cronInfoRoutes from './cronInfo.js';
import historyRoutes from './history.js';

const router = express.Router();

router.use(statusRoutes);
router.use(tasksRoutes);
router.use(taskUpdateRoutes);
router.use(taskRunRoutes);
router.use(restartRoutes);
router.use(cronInfoRoutes);
router.use(historyRoutes);

export default router;
