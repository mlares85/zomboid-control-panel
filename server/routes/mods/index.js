import express from "express";
import trackingRouter from "./tracking/index.js";
import iniRouter from "./ini/index.js";
import conflictsRouter from "./conflicts/index.js";
import collectionsRouter from "./collections/index.js";
import diskRouter from "./disk/index.js";
import searchRouter from "./search/index.js";
import presetsRouter from "./presets.js";
import loadOrderRouter from "./loadOrder.js";

const router = express.Router();

router.use(trackingRouter);
router.use(iniRouter);
router.use(conflictsRouter);
router.use(collectionsRouter);
router.use(diskRouter);
router.use(searchRouter);
router.use(presetsRouter);
router.use(loadOrderRouter);

export default router;
