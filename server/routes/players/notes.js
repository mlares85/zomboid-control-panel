// ============================================
// Player Notes & Tags
// ============================================
import express from 'express';
import { createLogger } from '../../utils/logger.js';
import {
  getPlayerNotes,
  getPlayerNote,
  upsertPlayerNote,
  deletePlayerNote,
} from '../../database/init.js';
import { sanitizeError } from '../../utils/sanitize.js';

const log = createLogger('API:Players');
const router = express.Router();

// Get all player notes
router.get('/notes', async (req, res) => {
  try {
    const notes = await getPlayerNotes();
    res.json({ success: true, notes });
  } catch (error) {
    log.error(`Failed to get player notes: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get note for specific player
router.get('/notes/:playerName', async (req, res) => {
  try {
    const note = await getPlayerNote(req.params.playerName);
    res.json({ success: true, note });
  } catch (error) {
    log.error(`Failed to get player note: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Create or update player note
router.post('/notes', async (req, res) => {
  try {
    const { playerName, note } = req.body;
    const tags = req.body.tags || [];

    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Validate note length
    if (note && note.length > 10000) {
      return res.status(400).json({ error: 'Note too long (max 10000 characters)' });
    }

    // Validate tags array and individual tag format
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }
    if (tags.some(t => typeof t !== 'string' || t.length > 50)) {
      return res.status(400).json({ error: 'Tags must be strings (max 50 chars each)' });
    }

    const result = await upsertPlayerNote(playerName, note, tags);
    res.json({ success: true, note: result });
  } catch (error) {
    log.error(`Failed to save player note: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Delete player note
router.delete('/notes/:playerName', async (req, res) => {
  try {
    const success = await deletePlayerNote(req.params.playerName);
    res.json({ success });
  } catch (error) {
    log.error(`Failed to delete player note: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
