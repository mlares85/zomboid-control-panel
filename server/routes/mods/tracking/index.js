import express from "express";
import trackedModsRouter from "./trackedMods.js";
import ignoredRouter from "./ignored.js";
import checkerControlRouter from "./checkerControl.js";
import syncRouter from "./sync.js";

const router = express.Router();

router.use(trackedModsRouter);
router.use(ignoredRouter);
router.use(checkerControlRouter);
router.use(syncRouter);

export default router;
