import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { createLogger } from "../../utils/logger.js";
const log = createLogger("API:Files");
import { getActiveServer, getAllSettings } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { getServerConfigPath } from "./context.js";

const router = express.Router();

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
]);

/**
 * Build the list of directories the file browser is allowed to access.
 * Restricts browsing to the server config path, server install path,
 * and Zomboid data path — prevents arbitrary filesystem traversal.
 */
async function getAllowedBrowseRoots() {
  const roots = [];
  const activeServer = await getActiveServer();
  if (activeServer?.serverConfigPath)
    roots.push(path.resolve(activeServer.serverConfigPath));
  if (activeServer?.zomboidDataPath)
    roots.push(path.resolve(activeServer.zomboidDataPath));
  if (activeServer?.serverPath)
    roots.push(path.resolve(activeServer.serverPath));
  const settings = await getAllSettings();
  if (settings.serverConfigPath)
    roots.push(path.resolve(settings.serverConfigPath));
  if (settings.zomboidDataPath)
    roots.push(path.resolve(settings.zomboidDataPath));
  // Always allow the default Zomboid config directory
  const defaultConfig = path.join(os.homedir(), "Zomboid");
  roots.push(path.resolve(defaultConfig));
  // De-duplicate
  return [...new Set(roots)];
}

/**
 * Check whether `target` is equal to or inside one of `allowedRoots`.
 * Returns the resolved target if allowed, or null if it escapes all roots.
 */
function confineToRoots(target, allowedRoots) {
  const resolved = path.resolve(target);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return resolved;
    }
  }
  return null;
}

// GET /browse-files - List directories and files at a given path
router.get("/browse-files", async (req, res) => {
  try {
    const browsePath = req.query.path ? String(req.query.path) : null;
    const filterExts = req.query.extensions
      ? String(req.query.extensions)
          .split(",")
          .map((e) => e.toLowerCase().trim())
      : null;

    const allowedRoots = await getAllowedBrowseRoots();
    let targetPath;
    if (browsePath) {
      targetPath = confineToRoots(browsePath, allowedRoots);
      if (!targetPath) {
        return res.status(403).json({
          error: "Access denied: path is outside allowed server directories",
        });
      }
    } else {
      // Default to the server config directory
      const configPath = await getServerConfigPath();
      targetPath = configPath || "";
    }

    if (!targetPath) {
      return res
        .status(400)
        .json({ error: "No path provided and server config path not set" });
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(400).json({ error: "Path does not exist" });
    }

    const stat = await fs.promises.stat(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    const entries = await fs.promises.readdir(targetPath, {
      withFileTypes: true,
    });

    const directories = [];
    const files = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip hidden/system directories
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          directories.push(entry.name);
        }
      } else {
        // Treat everything that's not a directory as a potential file
        // (avoids issues with pkg/Dirent.isFile() not working for some entries)
        const ext = path.extname(entry.name).toLowerCase();
        // If extension filter is provided, only show matching files
        if (filterExts) {
          if (filterExts.includes(ext)) {
            files.push({ name: entry.name, ext });
          }
        } else {
          // Default: show image files only
          if (IMAGE_EXTENSIONS.has(ext)) {
            files.push({ name: entry.name, ext });
          }
        }
      }
    }

    directories.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    res.json({
      currentPath: targetPath,
      parent:
        path.dirname(targetPath) !== targetPath &&
        confineToRoots(path.dirname(targetPath), allowedRoots)
          ? path.dirname(targetPath)
          : null,
      directories,
      files,
    });
  } catch (error) {
    log.error(`Failed to browse files: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// GET /image-preview - Serve an image file for preview (limited to image types, max 5MB)
router.get("/image-preview", async (req, res) => {
  try {
    const filePath = req.query.path ? String(req.query.path) : null;
    if (!filePath) {
      return res.status(400).json({ error: "Path is required" });
    }

    const allowedRoots = await getAllowedBrowseRoots();
    const resolved = confineToRoots(filePath, allowedRoots);
    if (!resolved) {
      return res.status(403).json({
        error: "Access denied: path is outside allowed server directories",
      });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: "File not found" });
    }

    const ext = path.extname(resolved).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: "Not an image file" });
    }

    const stat = await fs.promises.stat(resolved);
    if (stat.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Image file exceeds 5MB limit" });
    }

    const mimeMap = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".bmp": "image/bmp",
      ".webp": "image/webp",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    const previewStream = fs.createReadStream(resolved);
    previewStream.on("error", (err) => {
      log.error(`Image preview stream error: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    previewStream.pipe(res);
  } catch (error) {
    log.error(`Failed to serve image preview: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
