import express from "express";
import autoScanRoutes from "./autoScan.js";
import detectRoutes from "./detect.js";
import collectionRoutes from "./collection.js";
import statusRoutes from "./status.js";
import byIdRoutes from "./byId.js";
import activateRoutes from "./activate.js";

const router = express.Router();

// Order matters: /status and /active (in statusRoutes) must be registered
// before the GET /:id wildcard (in byIdRoutes), or /:id would swallow them.
router.use(autoScanRoutes);
router.use(detectRoutes);
router.use(collectionRoutes);
router.use(statusRoutes);
router.use(byIdRoutes);
router.use(activateRoutes);

export default router;
