import express from "express";
import resolveRoutes from "./resolve.js";
import vehiclesRoutes from "./vehicles.js";
import tilesRoutes from "./tiles.js";
import settingsRoutes from "./settings.js";

const router = express.Router();

router.use(resolveRoutes);
router.use(vehiclesRoutes);
router.use(tilesRoutes);
router.use(settingsRoutes);

export default router;

// Exposed so the diagnostics route can probe the exact URLs this proxy would
// request, instead of a hardcoded build that may not be the one in use.
export { PZ_MAP_ROOT, getB42Dir } from "./b42Resolution.js";
export { getB42TopFormat } from "./topFormat.js";
