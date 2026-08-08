import express from "express";
import path from "path";
import { PZ_MAP_ROOT, getB42Dir } from "./b42Resolution.js";
import { getB42TopFormat, TOP_CONTENT_TYPES } from "./topFormat.js";
import { serveTile } from "./tileFetch.js";

const router = express.Router();

// Proxy DZI tiles from map.projectzomboid.com (migrated from b42map.com) to
// avoid CORS restrictions. Resolves the latest B42 map directory dynamically
// from build_list.json so new PZ map builds are picked up automatically.
// Validates inputs to prevent SSRF — only allows numeric level 0-22,
// floor -17..30, and tile filenames matching the DZI convention.
router.get("/tiles/:level/:tile", async (req, res) => {
  const level = parseInt(req.params.level, 10);
  const tile = req.params.tile;
  const floorRaw = Array.isArray(req.query.floor)
    ? req.query.floor[0]
    : req.query.floor;
  const floor = parseInt(String(floorRaw ?? "0"), 10);

  if (isNaN(level) || level < 0 || level > 22) {
    return res.status(400).json({ error: "Invalid level" });
  }
  // Client clamps floor to -17..29 (WorldMap.tsx changeFloor); keep the
  // backend in sync so anything outside the real range is rejected early.
  if (isNaN(floor) || floor < -17 || floor > 29) {
    return res.status(400).json({ error: "Invalid floor" });
  }
  // Every B42 layer DZI declares JPEG tiles, including basements and upper floors.
  const ext = "jpg";
  if (!new RegExp(`^\\d+_\\d+\\.${ext}$`).test(tile)) {
    return res.status(400).json({ error: "Invalid tile" });
  }

  const dir = await getB42Dir();
  const url = `${PZ_MAP_ROOT}/maps/${dir}/base/layer${floor}_files/${level}/${tile}`;
  const contentType = "image/jpeg";
  const relPath = path.join("b42", dir, `layer${floor}`, String(level), tile);
  await serveTile(req, res, url, contentType, relPath);
});

// Proxy B42 top-down DZI tiles (used by ChunkCleaner for overhead map view).
// These tiles use webp format at all levels.
// Only floor 0 is available in the top-down view.
router.get("/toptiles/:level/:tile", async (req, res) => {
  const level = parseInt(req.params.level, 10);
  const tile = req.params.tile;

  if (isNaN(level) || level < 0 || level > 22) {
    return res.status(400).json({ error: "Invalid level" });
  }
  const parsed = /^(\d+_\d+)\.(webp|jpe?g|png)$/.exec(tile);
  if (!parsed) {
    return res.status(400).json({ error: "Invalid tile" });
  }

  const dir = await getB42Dir();
  // The requested extension is ignored: the client cannot know which format a
  // given build was rendered in, so the upstream descriptor decides.
  const format = await getB42TopFormat(dir);
  const upstreamTile = `${parsed[1]}.${format}`;
  const url = `${PZ_MAP_ROOT}/maps/${dir}/base_top/layer0_files/${level}/${upstreamTile}`;
  const relPath = path.join("b42-top", dir, String(level), upstreamTile);
  await serveTile(req, res, url, TOP_CONTENT_TYPES[format], relPath);
});

// Proxy B41 DZI tiles from map.projectzomboid.com.
router.get("/b41tiles/:level/:tile", async (req, res) => {
  const level = parseInt(req.params.level, 10);
  const tile = req.params.tile;

  if (isNaN(level) || level < 0 || level > 22) {
    return res.status(400).json({ error: "Invalid level" });
  }
  if (!/^\d+_\d+\.jpg$/.test(tile)) {
    return res.status(400).json({ error: "Invalid tile" });
  }

  const url = `${PZ_MAP_ROOT}/maps/41.78.16/base/layer0_files/${level}/${tile}`;
  const relPath = path.join("b41", String(level), tile);
  await serveTile(req, res, url, "image/jpeg", relPath);
});

export default router;
