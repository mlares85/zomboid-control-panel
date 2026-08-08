import express from "express";
import serverConfigRoutes from "./serverConfig.js";
import optionsRoutes from "./options.js";
import appSettingsRoutes from "./appSettings.js";
import corsDebugRoutes from "./corsDebug.js";
import pathsRoutes from "./paths.js";
import rconConfigRoutes from "./rconConfig.js";

const router = express.Router();

router.use(serverConfigRoutes);
router.use(optionsRoutes);
router.use(appSettingsRoutes);
router.use(corsDebugRoutes);
router.use(pathsRoutes);
router.use(rconConfigRoutes);

export default router;
export { isMaskedSecret } from "./secrets.js";
