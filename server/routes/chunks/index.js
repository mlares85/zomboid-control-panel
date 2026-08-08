import express from "express";
import { remoteGuardMiddleware } from "./remoteGuard.js";
import savesRoutes from "./savesRoute.js";
import pathConfigRoutes from "./pathConfigRoutes.js";
import chunksRoutes from "./chunksRoute.js";
import deleteChunksRoutes from "./deleteChunksRoute.js";
import deleteRegionRoutes from "./deleteRegionRoute.js";
import statsRoutes from "./statsRoute.js";
import browseRoutes from "./browseRoute.js";

const router = express.Router();

// Blocks every route below for remote servers (no local filesystem access).
router.use(remoteGuardMiddleware);

router.use(savesRoutes);
router.use(pathConfigRoutes);
router.use(chunksRoutes);
router.use(deleteChunksRoutes);
router.use(deleteRegionRoutes);
router.use(statsRoutes);
router.use(browseRoutes);

export default router;

// Re-export for tests / other modules that still pull these from chunks.
export { normalizeUserPath, getCandidateZomboidPaths } from "../../utils/zomboidPaths.js";
