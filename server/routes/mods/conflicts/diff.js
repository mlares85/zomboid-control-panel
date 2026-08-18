import express from "express";
import path from "path";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getServerPath } from "../../../utils/mods/serverConfig.js";
import { getWorkshopPaths } from "../../../utils/mods/workshopPaths.js";
import { getModDetailsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { readIniModLists } from "../../../utils/mods/conflictScan/fileIndex.js";
import { computeUnifiedDiff, hashFileSync } from "../../../utils/mods/conflictScan/diffUtils.js";
import { LocalFiles } from "../../../services/fileAccess/index.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── File diff endpoint ─────────────────────────────────────────────────────
// Compare two mods' versions of the same file.
// GET /api/mods/conflicts/diff?file=<relPath>&modA=<modId>&modB=<modId>
const DIFF_MAX_BYTES = 512 * 1024; // 512 KB max for diffing

router.get("/conflicts/diff", async (req, res) => {
  try {
    const fileAccess = new LocalFiles();
    const { file, modA, modB } = req.query;
    if (!file || !modA || !modB) {
      return res.status(400).json({
        error:
          "Could not load file comparison — missing file or mod information",
      });
    }

    // Sanitize mod IDs — only allow safe characters (alphanumeric, hyphens, underscores, dots, spaces)
    const modAStr = String(modA);
    const modBStr = String(modB);
    if (
      !/^[\w .\-]{1,200}$/.test(modAStr) ||
      !/^[\w .\-]{1,200}$/.test(modBStr)
    ) {
      return res
        .status(400)
        .json({ error: "Could not identify one of the mods — try rescanning" });
    }

    // Validate the file path doesn't try path traversal
    const normalizedFile = String(file).replace(/\\/g, "/");
    if (
      normalizedFile.includes("..") ||
      path.isAbsolute(normalizedFile) ||
      normalizedFile.length > 500
    ) {
      return res.status(400).json({
        error: "The file path looks invalid — try rescanning conflicts",
      });
    }

    const serverPath = await getServerPath();
    if (!serverPath)
      return res.status(400).json({
        error: "Server install path not set — configure it in Servers > Edit",
        fixUrl: "/servers",
      });
    const { workshopIds } = await readIniModLists();

    // Find the absolute paths for this file in both mods
    let pathA = null,
      pathB = null;
    for (const wsId of workshopIds) {
      if (!/^\d{1,15}$/.test(wsId)) continue;
      const possiblePaths = getWorkshopPaths(wsId, serverPath);
      let workshopPath = null;
      for (const p of possiblePaths) {
        if (await fileAccess.exists(p)) {
          workshopPath = p;
          break;
        }
      }
      if (!workshopPath) continue;

      const modDetails = getModDetailsFromWorkshop(wsId, serverPath);
      const modsFolder = path.join(workshopPath, "mods");
      const searchBase = (await fileAccess.exists(modsFolder))
        ? modsFolder
        : workshopPath;
      let modEntries;
      try {
        modEntries = await fileAccess.readdir(searchBase, {
          withFileTypes: true,
        });
      } catch (e) {
        log.debug(`Could not read mod directory ${searchBase}: ${e.message}`);
        continue;
      }

      for (const modDir of modEntries) {
        if (!modDir.isDirectory) continue;
        const matchingMod = modDetails.find(
          (m) => m.id === modDir.name || m.name === modDir.name,
        );
        const modId = matchingMod?.id || modDir.name;
        const modDirPath = path.join(searchBase, modDir.name);

        // Collect media paths: direct media/ + B42 versioned subfolders (42/, 42.X/, common/)
        const mediaCandidates = [path.join(modDirPath, "media")];
        if (!(await fileAccess.exists(mediaCandidates[0]))) {
          mediaCandidates.length = 0;
          try {
            const subDirs = await fileAccess.readdir(modDirPath, {
              withFileTypes: true,
            });
            for (const sub of subDirs) {
              if (
                sub.isDirectory &&
                /^(42(\.\d+)?|common)$/i.test(sub.name)
              ) {
                mediaCandidates.push(path.join(modDirPath, sub.name, "media"));
              }
            }
          } catch (e) {
            /* skip unreadable */
          }
        }

        for (const mediaDir of mediaCandidates) {
          const candidate = path.join(mediaDir, normalizedFile);
          const resolved = path.resolve(candidate);
          const mediaBase = path.resolve(mediaDir);
          if (
            !resolved.startsWith(mediaBase + path.sep) &&
            resolved !== mediaBase
          )
            continue;
          if (modId === String(modA) && (await fileAccess.exists(candidate)))
            pathA = candidate;
          if (modId === String(modB) && (await fileAccess.exists(candidate)))
            pathB = candidate;
        }
      }
      if (pathA && pathB) break;
    }

    if (!pathA || !pathB) {
      return res.status(404).json({
        error:
          "Could not find both mod files on disk — they may have been removed or updated since the last scan",
      });
    }

    // Determine if files are text or binary
    const ext = path.extname(normalizedFile).toLowerCase();
    const textExts = new Set([
      ".lua",
      ".txt",
      ".xml",
      ".json",
      ".cfg",
      ".ini",
      ".csv",
      ".md",
      ".properties",
      ".script",
    ]);
    const imageExts = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".bmp",
      ".tga",
    ]);
    const isText = textExts.has(ext);
    const isImage = imageExts.has(ext);

    if (isImage) {
      // For images, return base64 thumbnails
      const statA = await fileAccess.stat(pathA);
      const statB = await fileAccess.stat(pathB);
      const maxImg = 2 * 1024 * 1024; // 2 MB cap
      const readBase64 = async (p, size) => {
        if (size > maxImg) return null;
        const result = await fileAccess.readFileBinary(p);
        return result.success ? result.data.toString("base64") : null;
      };
      return res.json({
        type: "image",
        ext,
        modA: {
          size: statA.size,
          base64: await readBase64(pathA, statA.size),
        },
        modB: {
          size: statB.size,
          base64: await readBase64(pathB, statB.size),
        },
      });
    }

    if (!isText) {
      // Binary/unknown — just return file sizes and hashes
      const statA = await fileAccess.stat(pathA);
      const statB = await fileAccess.stat(pathB);
      return res.json({
        type: "binary",
        ext,
        modA: { size: statA.size, hash: hashFileSync(pathA) },
        modB: { size: statB.size, hash: hashFileSync(pathB) },
      });
    }

    // Text diff — simple LCS-based unified diff
    const statA = await fileAccess.stat(pathA);
    const statB = await fileAccess.stat(pathB);
    if (statA.size > DIFF_MAX_BYTES || statB.size > DIFF_MAX_BYTES) {
      return res.json({
        type: "text-too-large",
        ext,
        modA: { size: statA.size, hash: hashFileSync(pathA) },
        modB: { size: statB.size, hash: hashFileSync(pathB) },
      });
    }

    const resultA = await fileAccess.readFile(pathA);
    const resultB = await fileAccess.readFile(pathB);
    const contentA = resultA.success ? resultA.data : "";
    const contentB = resultB.success ? resultB.data : "";
    const linesA = contentA.split("\n");
    const linesB = contentB.split("\n");

    // Myers-like diff: compute edit script between linesA and linesB
    const hunks = computeUnifiedDiff(linesA, linesB, 3);

    res.json({
      type: "text",
      ext,
      modA: { size: statA.size, lineCount: linesA.length },
      modB: { size: statB.size, lineCount: linesB.length },
      hunks,
      totalAdded: hunks.reduce(
        (s, h) => s + h.lines.filter((l) => l.type === "add").length,
        0,
      ),
      totalRemoved: hunks.reduce(
        (s, h) => s + h.lines.filter((l) => l.type === "remove").length,
        0,
      ),
    });
  } catch (error) {
    log.error(`Failed to diff files: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
