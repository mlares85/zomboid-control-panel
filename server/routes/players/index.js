import express from 'express';
import rosterRoutes from './roster.js';
import moderationRoutes from './moderation.js';
import steamBansRoutes from './steamBans.js';
import teleportRoutes from './teleport.js';
import itemsRoutes from './items.js';
import vehiclesRoutes from './vehicles.js';
import modesRoutes from './modes.js';
import catalogRoutes from './catalog.js';
import notesRoutes from './notes.js';
import statsRoutes from './stats.js';
import exportsRoutes from './exports.js';

const router = express.Router();

router.use(rosterRoutes);
router.use(moderationRoutes);
router.use(steamBansRoutes);
router.use(teleportRoutes);
router.use(itemsRoutes);
router.use(vehiclesRoutes);
router.use(modesRoutes);
router.use(catalogRoutes);
router.use(notesRoutes);
router.use(statsRoutes);
router.use(exportsRoutes);

export default router;
