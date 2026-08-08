import express from "express";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { createLogger } from "../../../utils/logger.js";
import { getDataPaths } from "../../../utils/paths.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { logBuffer } from "../logBuffer.js";
import { getAvailableLogFiles, getSupportBundleEntries } from "../support-bundle/collectFiles.js";
import { buildBundleDiagnostics } from "../support-bundle/bundle.js";

const log = createLogger("API:Debug");
const router = express.Router();

// Get recent logs from buffer
router.get("/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 200;
    res.json({
      logs: logBuffer.slice(-limit),
      total: logBuffer.length,
    });
  } catch (error) {
    log.error(`Failed to get logs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// List available log files
router.get("/logs/files", async (req, res) => {
  try {
    const paths = getDataPaths();
    const logsDir = paths.logsDir;

    try {
      await fs.promises.access(logsDir);
    } catch (e) {
      log.debug(`Logs directory not accessible (${logsDir}): ${e.message}`);
      return res.json({ files: [] });
    }

    const files = await getAvailableLogFiles(logsDir);

    res.json({ files });
  } catch (error) {
    log.error(`Failed to list log files: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Download combined log file
router.get("/logs/download", async (req, res) => {
  try {
    const paths = getDataPaths();
    const logsPath = path.join(paths.logsDir, "combined.log");

    if (!fs.existsSync(logsPath)) {
      return res.status(404).json({ error: "Log file not found" });
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=combined.log");

    const readStream = fs.createReadStream(logsPath);
    readStream.on("error", (err) => {
      log.error(`Log file read error: ${err.message}`);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to read log file" });
      else res.destroy();
    });
    readStream.pipe(res);
  } catch (error) {
    log.error(`Failed to download logs: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Download all log files as a zip archive
router.get("/logs/download-zip", async (req, res) => {
  try {
    log.info("GET /logs/download-zip");

    const { entries, activeServer, sources } = await getSupportBundleEntries();
    if (entries.length === 0) {
      return res.status(404).json({ error: "No support logs found" });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveName = `pz-support-bundle-${timestamp}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${archiveName}"`,
    );

    const archive = archiver("zip", {
      zlib: { level: 6 },
    });

    archive.on("warning", (error) => {
      log.warn(`Log zip warning: ${error.message}`);
    });

    archive.on("error", (error) => {
      log.error(`Failed to create log archive: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create log archive" });
      } else {
        res.destroy(error);
      }
    });

    archive.pipe(res);

    const manifest = [
      "Project Zomboid Control Panel Support Bundle",
      `Generated: ${new Date().toISOString()}`,
      `Active Server: ${activeServer?.name || activeServer?.serverName || "Not configured"}`,
      `Panel Logs Dir: ${sources.panelLogsDir || "n/a"}`,
      `Zomboid Data Dir: ${sources.zomboidDataRoot || "n/a"}`,
      `Install Dir: ${sources.installRoot || "n/a"}`,
      `Included Files: ${entries.length}`,
      "",
      "Contents:",
      "- admin-panel: panel combined/error logs",
      "- zomboid-server: server-console and runtime logs",
      "- zomboid-install: install-side connection/workshop/system logs",
      "- crash-logs: matching crash/error dump files",
    ].join("\n");

    archive.append(manifest, { name: "support-bundle-info.txt" });

    for (const entry of entries) {
      archive.file(entry.filePath, { name: entry.archivePath });
    }

    // ── Diagnostic JSON files (best-effort; collectors never throw) ──
    try {
      const diagnostics = await buildBundleDiagnostics(activeServer);
      for (const f of diagnostics) {
        archive.append(f.content, { name: f.name });
      }
      log.info(
        `Support bundle: appended ${diagnostics.length} diagnostic files + ${entries.length} log files`,
      );
    } catch (diagErr) {
      log.warn(`Support bundle diagnostics failed: ${diagErr.message}`);
      archive.append(
        `Diagnostic collection failed: ${diagErr.message}\nStack:\n${diagErr.stack || "(no stack)"}\n`,
        { name: "diagnostics-error.txt" },
      );
    }

    archive.finalize();
  } catch (error) {
    log.error(`Failed to download log archive: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Download specific log file by name
router.get("/logs/download/:filename", async (req, res) => {
  try {
    const paths = getDataPaths();
    const filename = req.params.filename;
    log.info(`GET /logs/download/${filename}`);

    // Security: prevent path traversal
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const logsPath = path.join(paths.logsDir, filename);

    if (!fs.existsSync(logsPath)) {
      return res.status(404).json({ error: "Log file not found" });
    }

    res.setHeader("Content-Type", "text/plain");
    const safeFilename = filename.replace(/["\r\n]/g, "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"`,
    );

    const readStream = fs.createReadStream(logsPath);
    readStream.on("error", (err) => {
      log.error(`Log file read error: ${err.message}`);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to read log file" });
      else res.destroy();
    });
    readStream.pipe(res);
  } catch (error) {
    log.error(`Failed to download log file: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Clear in-memory log buffer
router.post("/logs/clear", async (req, res) => {
  try {
    log.info("POST /logs/clear");
    logBuffer.length = 0;
    res.json({ success: true, message: "Log buffer cleared" });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
