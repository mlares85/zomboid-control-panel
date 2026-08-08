import express from "express";
import collectionDiffRouter from "./collectionDiff.js";
import collectionMutationsRouter from "./collectionMutations.js";
import browserCookiesRouter from "./browserCookies.js";
import importCollectionRouter from "./importCollection.js";

const router = express.Router();

router.use(collectionDiffRouter);
router.use(collectionMutationsRouter);
router.use(browserCookiesRouter);
router.use(importCollectionRouter);

export default router;
