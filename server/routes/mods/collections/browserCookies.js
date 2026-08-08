import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { setSetting } from "../../../database/init.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { listAvailableBrowsers, extractSteamCookies } from "../../../utils/browserCookies.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Browser cookie auto-extraction ─────────────────────────────────────────
// Lists browsers detected on the host machine and (optionally) extracts the
// Steam session cookies from one of them so the user does not have to paste
// them manually. Windows-only for now; Firefox/Chrome/Edge/Brave supported.

router.get("/collection/browsers", async (req, res) => {
  try {
    const info = listAvailableBrowsers();
    res.json(info);
  } catch (error) {
    log.error(`List browsers failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

router.post("/collection/extract-cookies", async (req, res) => {
  try {
    const browser = String(req.body?.browser || "")
      .toLowerCase()
      .trim();
    const allowed = ["firefox", "chrome", "edge", "brave"];
    if (!allowed.includes(browser)) {
      return res.status(400).json({
        error: "Invalid browser. Must be one of: " + allowed.join(", "),
      });
    }
    const result = await extractSteamCookies(browser);
    if (!result.ok) {
      return res.status(200).json(result); // 200 with ok:false so the UI can render the message
    }
    res.json(result);
  } catch (error) {
    log.error(`Extract cookies failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Push endpoint used by the panel browser extension. The extension reads
// Steam cookies via the WebExtensions `cookies` API (works regardless of
// Chrome's App-Bound Encryption) and POSTs them here. Authentication is the
// usual JWT — the extension logs in with the panel's normal username/password
// first to obtain a token.
router.post("/collection/extension-push", async (req, res) => {
  try {
    const sessionid =
      typeof req.body?.sessionid === "string" ? req.body.sessionid.trim() : "";
    const loginSecure =
      typeof req.body?.steamLoginSecure === "string"
        ? req.body.steamLoginSecure.trim()
        : "";

    if (!sessionid || !loginSecure) {
      return res
        .status(400)
        .json({ error: "Both sessionid and steamLoginSecure are required" });
    }
    // Cookie values must not contain CR/LF/null/semicolon — those would break
    // the Cookie header we build for Workshop write requests and could be
    // used for header injection.
    const HAS_CONTROL = /[\r\n\0;]/;
    if (HAS_CONTROL.test(sessionid) || HAS_CONTROL.test(loginSecure)) {
      return res
        .status(400)
        .json({ error: "Cookie values contain forbidden control characters" });
    }
    // Sanity-check value lengths — Steam cookies are well under 1 KB each.
    if (sessionid.length > 4096 || loginSecure.length > 4096) {
      return res
        .status(400)
        .json({ error: "Cookie values are unexpectedly long" });
    }

    await setSetting("steamSessionId", sessionid);
    await setSetting("steamLoginSecure", loginSecure);

    log.info(
      `Steam cookies updated via browser extension (user: ${req.user?.username || "unknown"})`,
    );
    res.json({ ok: true, message: "Cookies saved" });
  } catch (error) {
    log.error(`Extension push failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Serves the panel's browser extension as a zip. Prefers a prebuilt zip next
// to the install, but falls back to zipping `browser-extension/` on the fly —
// Docker images and pkg builds ship the source folder, not the zip, so
// relying on a prebuilt artifact made this endpoint 404 for most installs.
const EXTENSION_SOURCE_FILES = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "README.md",
];

function resolveExtensionPaths() {
  const isPkg = typeof process.pkg !== "undefined";
  const baseDir = isPkg
    ? path.dirname(process.execPath)
    : path.resolve(process.cwd());
  const zipCandidates = [
    path.join(baseDir, "zomboid-panel-extension.zip"),
    path.join(baseDir, "release", "zomboid-panel-extension.zip"),
    path.join(baseDir, "..", "release", "zomboid-panel-extension.zip"),
  ];
  const dirCandidates = [
    path.join(baseDir, "browser-extension"),
    path.join(baseDir, "..", "browser-extension"),
  ];
  return { zipCandidates, dirCandidates };
}

function firstExisting(candidates) {
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

router.get("/collection/extension-bundle", async (req, res) => {
  try {
    const { zipCandidates, dirCandidates } = resolveExtensionPaths();

    const zipPath = firstExisting(zipCandidates);
    if (zipPath) {
      const stat = fs.statSync(zipPath);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="zomboid-panel-extension.zip"',
      );
      res.setHeader("Content-Length", String(stat.size));
      fs.createReadStream(zipPath).pipe(res);
      return;
    }

    const srcDir = firstExisting(dirCandidates);
    if (!srcDir) {
      return res.status(404).json({
        error:
          "Browser extension files are missing from this panel install. Download zomboid-panel-extension.zip from the GitHub release instead.",
      });
    }

    const { default: archiver } = await import("archiver");
    const archive = archiver("zip", { zlib: { level: 9 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="zomboid-panel-extension.zip"',
    );
    archive.on("error", (err) => {
      log.error(`Extension bundle zip failed: ${err.message}`);
      res.destroy();
    });
    archive.pipe(res);
    for (const name of EXTENSION_SOURCE_FILES) {
      const filePath = path.join(srcDir, name);
      if (fs.existsSync(filePath)) archive.file(filePath, { name });
    }
    await archive.finalize();
  } catch (error) {
    log.error(`Extension bundle serve failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
