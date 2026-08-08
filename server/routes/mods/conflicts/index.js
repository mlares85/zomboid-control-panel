import express from "express";
import missingDepsRouter from "./missingDeps.js";
import batchDepsRouter from "./batchDeps.js";
import scanRouter from "./scan.js";
import streamRouter from "./stream.js";
import diffRouter from "./diff.js";

const router = express.Router();

router.use(missingDepsRouter);
router.use(batchDepsRouter);
router.use(scanRouter);
router.use(streamRouter);
router.use(diffRouter);

export default router;
