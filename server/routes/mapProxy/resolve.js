import express from "express";
import { PZ_MAP_ROOT, getB42Map, getMapVersions } from "./b42Resolution.js";
import { fetchMapForVersion } from "./versionResolution.js";

const router = express.Router();

// Resolves the latest B42 build (default) or a specific version.
// Returns geometry + enough info for direct-to-upstream tile URLs.
router.get("/resolve", async (req, res) => {
  const version = typeof req.query.version === "string" ? req.query.version : null;

  const map = version ? await fetchMapForVersion(version) : await getB42Map();
  res.set("Cache-Control", "public, max-age=3600");
  res.json({
    root: PZ_MAP_ROOT,
    b42Dir: map.directory,
    b41Path: "maps/41.78.16/base/layer0_files",
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    maxLevel: map.maxLevel,
    // The deepest level the client should actually request — see
    // discoverRenderedMaxLevel's comment in b42Resolution.js. Falls back to
    // maxLevel itself only if this particular map source predates that
    // field (e.g. fetchMapForVersion, which has no discovery pipeline, or
    // an old-shaped cached response during a rolling restart) — a client
    // should still get a sane value, not undefined.
    renderedMaxLevel: map.renderedMaxLevel ?? map.maxLevel,
    x0: map.x0,
    y0: map.y0,
    sqr: map.sqr,
    scale: map.scale,
  });
});

// Available map versions for the version selector dropdown.
router.get("/versions", async (_req, res) => {
  const versions = await getMapVersions();
  const resolved = await getB42Map();
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ versions, current: resolved.directory });
});

export default router;
