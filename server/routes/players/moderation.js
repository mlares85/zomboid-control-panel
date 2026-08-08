import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { logPlayerAction } from '../../database/init.js';
import { ACCESS_LEVELS } from '../../utils/commands.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { isValidUsername, isValidText } from './validators.js';

const log = createLogger('API:Players');
const router = express.Router();

// Kick player
router.post('/kick', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, reason } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    if (reason && !isValidText(reason)) {
      return res.status(400).json({ error: 'Invalid reason format' });
    }

    const result = await rconService.kickPlayer(username, reason);
    log.info(`POST /kick: ${username} (reason=${reason || 'none'})`);
    await logPlayerAction(username, 'kick', reason);

    res.json(result);
  } catch (error) {
    log.error(`Failed to kick player: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Ban player
router.post('/ban', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, banIp, reason } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    if (reason && !isValidText(reason)) {
      return res.status(400).json({ error: 'Invalid reason format' });
    }

    const result = await rconService.banPlayer(username, banIp, reason);
    log.info(`POST /ban: ${username} (banIp=${banIp}, reason=${reason || 'none'})`);
    await logPlayerAction(username, 'ban', `IP: ${banIp}, Reason: ${reason}`);

    res.json(result);
  } catch (error) {
    log.error(`Failed to ban player: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Unban player
router.post('/unban', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await rconService.unbanPlayer(username);
    log.info(`POST /unban: ${username}`);
    await logPlayerAction(username, 'unban', null);

    res.json(result);
  } catch (error) {
    log.error(`Failed to unban player: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Set access level
router.post('/access-level', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, level } = req.body;

    if (!username || !level) {
      return res.status(400).json({ error: 'Username and level are required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    if (!ACCESS_LEVELS.includes(level.toLowerCase())) {
      return res.status(400).json({ error: `Invalid access level. Valid: ${ACCESS_LEVELS.join(', ')}` });
    }

    const result = await rconService.setAccessLevel(username, level);
    log.info(`POST /access-level: ${username} → ${level}`);
    await logPlayerAction(username, 'access_level', level);

    res.json(result);
  } catch (error) {
    log.error(`Failed to set access level: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Add to whitelist
router.post('/whitelist/add', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await rconService.addToWhitelist(username);
    log.info(`POST /whitelist/add: ${username}`);
    await logPlayerAction(username, 'whitelist_add', null);

    res.json(result);
  } catch (error) {
    log.error(`Failed to add to whitelist: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Remove from whitelist
router.post('/whitelist/remove', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await rconService.removeFromWhitelist(username);
    log.info(`POST /whitelist/remove: ${username}`);
    await logPlayerAction(username, 'whitelist_remove', null);

    res.json(result);
  } catch (error) {
    log.error(`Failed to remove from whitelist: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Voice ban
router.post('/voiceban', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, enabled } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await rconService.voiceBan(username, enabled);
    log.info(`POST /voiceban: ${username} → ${enabled ? 'ON' : 'OFF'}`);
    await logPlayerAction(username, 'voiceban', enabled ? 'enabled' : 'disabled');

    res.json(result);
  } catch (error) {
    log.error(`Failed to set voice ban: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Add user to whitelist server (with password)
router.post('/adduser', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    // Password validation - alphanumeric and some special chars
    if (!/^[a-zA-Z0-9!@#$%^&*_-]{4,64}$/.test(password)) {
      return res.status(400).json({ error: 'Invalid password format' });
    }

    const result = await rconService.addUser(username, password);
    await logPlayerAction(username, 'adduser', null);

    res.json(result);
  } catch (error) {
    log.error(`Failed to add user: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Add all connected players to whitelist
router.post('/whitelist/addall', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const result = await rconService.addAllToWhitelist();

    res.json(result);
  } catch (error) {
    log.error(`Failed to add all to whitelist: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
