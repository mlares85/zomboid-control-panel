import express from "express";
import diskOnlyRouter from "./diskOnly.js";
import deleteAndPurgeRouter from "./deleteAndPurge.js";
import batchDeleteRouter from "./batchDelete.js";
import resolveOrphanRouter from "./resolveOrphan.js";

const router = express.Router();

router.use(diskOnlyRouter);
router.use(deleteAndPurgeRouter);
router.use(batchDeleteRouter);
router.use(resolveOrphanRouter);

export default router;
