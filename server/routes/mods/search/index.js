import express from "express";
import modInfoRouter from "./modInfo.js";
import workshopSearchRouter from "./workshopSearch.js";
import thumbnailRouter from "./thumbnail.js";

const router = express.Router();

router.use(modInfoRouter);
router.use(workshopSearchRouter);
router.use(thumbnailRouter);

export default router;
