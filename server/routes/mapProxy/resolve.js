import express from "express";
import { PZ_MAP_ROOT, getB42Map } from "./b42Resolution.js";

const router = express.Router();

// Exposes the resolved B42 build: its geometry, which the client needs to
// address tiles at all (tile size and full-res dimensions differ between map
// builds, so neither side can hardcode them), plus enough to build
// direct-to-upstream tile URLs and load them straight from the browser
// instead of always routing through this server's proxy. Some deployments
// (e.g. a Kubernetes cluster with a restrictive Gateway API egress policy)
// block outbound access to map.projectzomboid.com for the panel's own pod
// while the admin's browser has no such restriction — in that case every
// tile-proxy fetch here fails no matter how good the retry/cache/circuit
// breaker logic is, but the browser can just fetch tiles itself.
router.get("/resolve", async (req, res) => {
  const map = await getB42Map();
  res.set("Cache-Control", "public, max-age=3600");
  res.json({
    root: PZ_MAP_ROOT,
    b42Dir: map.directory,
    b41Path: "maps/41.78.16/base/layer0_files",
    tileSize: map.tileSize,
    width: map.width,
    height: map.height,
    maxLevel: map.maxLevel,
    x0: map.x0,
    y0: map.y0,
    sqr: map.sqr,
    scale: map.scale,
  });
});

export default router;
