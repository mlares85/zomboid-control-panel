import express from "express";
import path from "path";
import { promises as fsp } from "fs";
import { createLogger } from "../../../utils/logger.js";
import { getTrackedMods } from "../../../database/init.js";
import { getDataPaths } from "../../../utils/paths.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Mod thumbnail proxy ────────────────────────────────────────────────────
// Streams the Steam Workshop preview image for a tracked mod, caching the
// bytes to disk so we hit Steam at most once per mod. Loaded via <img> tags
// so it must remain auth-exempt (see services/auth.js middleware).
//
// Cache lives at <dataDir>/mod-thumbnails/<workshopId>.img — single file per
// mod, no extension games. Content-Type is always reported as image/jpeg;
// browsers handle the actual decoding regardless (Steam serves JPEG or PNG).
const THUMB_FETCH_TIMEOUT_MS = 12_000;
const THUMB_MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard cap
const THUMB_INFLIGHT = new Map(); // workshopId → Promise<Buffer|null>
const THUMB_EMPTY_GIF = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

function sendEmptyThumbnail(res) {
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.end(THUMB_EMPTY_GIF);
}

async function fetchSteamPreviewUrl(workshopId) {
  // Fallback: hit GetPublishedFileDetails for a single ID if our DB row has no
  // preview_url yet (mod was added but update check hasn't run).
  const params = new URLSearchParams();
  params.append("itemcount", "1");
  params.append("publishedfileids[0]", workshopId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THUMB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      { method: "POST", body: params, signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.response?.publishedfiledetails?.[0];
    if (item?.result === 1 && typeof item.preview_url === "string") {
      return item.preview_url;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadThumbnail(previewUrl) {
  // Only allow Steam CDN hosts to prevent SSRF via tampered DB values.
  let parsed;
  try {
    parsed = new URL(previewUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === "steamuserimages-a.akamaihd.net" ||
    host.endsWith(".steamstatic.com") ||
    host.endsWith(".akamaihd.net") ||
    host === "images.steamusercontent.com";
  if (!allowed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THUMB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(previewUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const len = parseInt(res.headers.get("content-length") || "0", 10);
    if (len && len > THUMB_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > THUMB_MAX_BYTES) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

router.get("/thumbnail/:workshopId", async (req, res) => {
  const wsId = String(req.params.workshopId || "");
  if (!/^\d{1,15}$/.test(wsId)) {
    return res.status(400).end();
  }

  const dataDir = getDataPaths().dataDir;
  const cacheDir = path.join(dataDir, "mod-thumbnails");
  const cacheFile = path.join(cacheDir, `${wsId}.img`);

  // Defensive: confirm resolved path stays inside cacheDir.
  if (!cacheFile.startsWith(cacheDir + path.sep)) {
    return res.status(400).end();
  }

  try {
    const st = await fsp.stat(cacheFile);
    if (st.size > 0) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      return res.sendFile(cacheFile);
    }
  } catch {
    /* not cached yet */
  }

  // Coalesce concurrent requests for the same mod.
  let pending = THUMB_INFLIGHT.get(wsId);
  if (!pending) {
    pending = (async () => {
      // Locate preview URL from tracked mods (across all servers, not just
      // active — thumbnails are per-mod, not per-server).
      const tracked = await getTrackedMods();
      let mod = tracked.find((m) => m.workshop_id === wsId);
      let previewUrl = mod?.preview_url || null;
      if (!previewUrl) {
        previewUrl = await fetchSteamPreviewUrl(wsId);
        if (previewUrl) {
          try {
            const { setModPreviewUrl } = await import("../../../database/init.js");
            await setModPreviewUrl(wsId, previewUrl);
          } catch {
            /* best-effort */
          }
        }
      }
      if (!previewUrl) return null;
      const buf = await downloadThumbnail(previewUrl);
      if (!buf) return null;
      await fsp.mkdir(cacheDir, { recursive: true });
      const tmp = `${cacheFile}.tmp-${process.pid}-${Date.now()}`;
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, cacheFile);
      return buf;
    })().finally(() => {
      THUMB_INFLIGHT.delete(wsId);
    });
    THUMB_INFLIGHT.set(wsId, pending);
  }

  try {
    const buf = await pending;
    if (!buf) return sendEmptyThumbnail(res);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.end(buf);
  } catch (err) {
    log.debug(`Thumbnail fetch failed for ${wsId}: ${err.message}`);
    return sendEmptyThumbnail(res);
  }
});

export default router;
