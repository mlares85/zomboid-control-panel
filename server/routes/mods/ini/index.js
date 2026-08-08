import express from "express";
import writeToIniRouter from "./writeToIni.js";
import configReadRouter from "./configRead.js";
import addToIniRouter from "./addToIni.js";
import toggleRouter from "./toggle.js";
import removeFromIniRouter from "./removeFromIni.js";
import batchRemoveRouter from "./batchRemove.js";
import repairRouter from "./repair.js";
import syncModIdsRouter from "./syncModIds.js";
import validateRouter from "./validate.js";
import addAdvancedRouter from "./addAdvanced.js";

const router = express.Router();

router.use(writeToIniRouter);
router.use(configReadRouter);
router.use(addToIniRouter);
router.use(toggleRouter);
router.use(removeFromIniRouter);
router.use(batchRemoveRouter);
router.use(repairRouter);
router.use(syncModIdsRouter);
router.use(validateRouter);
router.use(addAdvancedRouter);

export default router;
