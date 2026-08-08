import express from 'express';
import listRoutes from './list.js';
import queryRoutes from './query.js';
import pingRoutes from './ping.js';
import debugRoutes from './debug.js';

const router = express.Router();

router.use(listRoutes);
router.use(queryRoutes);
router.use(pingRoutes);
router.use(debugRoutes);

export default router;
