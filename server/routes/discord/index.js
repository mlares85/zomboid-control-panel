import express from "express";
import statusRoutes from "./status.js";
import configRoutes from "./config.js";
import lifecycleRoutes from "./lifecycle.js";
import testRoutes from "./test.js";
import webhookEventsRoutes from "./webhookEvents.js";
import permissionsRoutes from "./permissions.js";

const router = express.Router();

router.use(statusRoutes);
router.use(configRoutes);
router.use(lifecycleRoutes);
router.use(testRoutes);
router.use(webhookEventsRoutes);
router.use(permissionsRoutes);

export default router;
