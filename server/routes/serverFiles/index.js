import express from "express";
import { remoteMirrorMiddleware } from "./remoteMirror.js";
import iniRoutes from "./ini.js";
import sandboxRoutes from "./sandboxRoutes.js";
import spawnPointsRoutes from "./spawnPoints.js";
import spawnRegionsRoutes from "./spawnRegions.js";
import rawFilesRoutes from "./rawFiles.js";
import backupsRoutes from "./backups.js";
import templatesRoutes from "./templates.js";
import templateActionsRoutes from "./templateActions.js";
import fileBrowserRoutes from "./fileBrowser.js";

const router = express.Router();

// Mirrors a remote server's Server/ folder in before any handler below runs,
// and pushes changes back out after. Must run before every sub-router.
router.use(remoteMirrorMiddleware);

router.use(rawFilesRoutes);
router.use(iniRoutes);
router.use(sandboxRoutes);
router.use(spawnPointsRoutes);
router.use(spawnRegionsRoutes);
router.use(backupsRoutes);
router.use(templatesRoutes);
router.use(templateActionsRoutes);
router.use(fileBrowserRoutes);

export default router;

// Re-exported for modules outside this router (panelBridge.js, debug.js)
// that call into serverFiles' sandbox helpers directly.
export { persistSandboxValues } from "./sandboxPersist.js";
export { checkSandboxBraceBalance } from "./sandboxWrite.js";
export { getServerName } from "./context.js";
