// ============================================
// Character export history
// ============================================
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { getDataPaths } from '../../utils/paths.js';

const log = createLogger('API:Players');
const router = express.Router();

// List all auto-exports (optionally filtered by username)
router.get('/exports', async (req, res) => {
  try {
    const { username } = req.query;
    const { dataDir } = getDataPaths();
    const exportsRoot = path.join(dataDir, 'exports');

    if (!fs.existsSync(exportsRoot)) {
      return res.json({ exports: [] });
    }

    const results = [];

    const players = username
      ? [username.replace(/[^a-zA-Z0-9_-]/g, '_')]
      : fs.readdirSync(exportsRoot).filter(f => {
          try { return fs.statSync(path.join(exportsRoot, f)).isDirectory(); } catch { return false; }
        });

    for (const playerDir of players) {
      const dirPath = path.join(exportsRoot, playerDir);
      if (!fs.existsSync(dirPath)) continue;
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json')).sort().reverse();
      for (const file of files) {
        const stat = fs.statSync(path.join(dirPath, file));
        results.push({
          username: playerDir,
          filename: file,
          size: stat.size,
          timestamp: stat.mtime.toISOString(),
        });
      }
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json({ exports: results });
  } catch (error) {
    log.error(`Failed to list exports: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Download a specific export file
router.get('/exports/:username/:filename', async (req, res) => {
  try {
    const { username, filename } = req.params;
    // Validate to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(username) || !/^[a-zA-Z0-9_.-]+\.json$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const { dataDir } = getDataPaths();
    const filePath = path.join(dataDir, 'exports', username, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export not found' });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (error) {
    log.error(`Failed to get export: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Delete a specific export file
router.delete('/exports/:username/:filename', async (req, res) => {
  try {
    const { username, filename } = req.params;
    if (!/^[a-zA-Z0-9_-]+$/.test(username) || !/^[a-zA-Z0-9_.-]+\.json$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const { dataDir } = getDataPaths();
    const filePath = path.join(dataDir, 'exports', username, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    log.error(`Failed to delete export: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
