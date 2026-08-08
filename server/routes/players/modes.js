import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { logPlayerAction } from '../../database/init.js';
import { sanitizeError } from '../../utils/sanitize.js';
import bridge from '../../services/panelBridge.js';
import { isValidUsername } from './validators.js';

const log = createLogger('API:Players');
const router = express.Router();

// B42's godmod/invisible commands only accept the "-true" value form and ignore
// a target username, so over RCON — which has no player of its own — they are
// a no-op. PanelBridge sets the flag on the player object instead.
async function setPlayerMode(req, bridgeAction, rconMethod, username, enabled) {
  if (bridge.isRunning) {
    const result = await bridge.sendCommand(bridgeAction, { username, enabled: enabled === true });
    return { ...result, via: 'bridge' };
  }
  const result = await req.app.get('rconService')[rconMethod](username, enabled);
  return {
    ...result,
    via: 'rcon',
    warning: 'PanelBridge is offline; RCON cannot target another player for this command.',
  };
}

// God mode
router.post('/godmode', async (req, res) => {
  try {
    const { username, enabled } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await setPlayerMode(req, 'setGodMode', 'setGodMode', username, enabled);
    log.info(`POST /godmode: ${username} → ${enabled ? 'ON' : 'OFF'} via ${result.via}`);
    await logPlayerAction(username, 'godmode', enabled ? 'enabled' : 'disabled');

    res.json(result);
  } catch (error) {
    log.error(`Failed to set godmode: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Invisible
router.post('/invisible', async (req, res) => {
  try {
    const { username, enabled } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await setPlayerMode(req, 'setInvisible', 'setInvisible', username, enabled);
    log.info(`POST /invisible: ${username} → ${enabled ? 'ON' : 'OFF'} via ${result.via}`);
    await logPlayerAction(username, 'invisible', enabled ? 'enabled' : 'disabled');

    res.json(result);
  } catch (error) {
    log.error(`Failed to set invisible: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Noclip
router.post('/noclip', async (req, res) => {
  try {
    const { username, enabled } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await setPlayerMode(req, 'setNoclip', 'setNoclip', username, enabled);
    log.info(`POST /noclip: ${username} → ${enabled ? 'ON' : 'OFF'} via ${result.via}`);
    await logPlayerAction(username, 'noclip', enabled ? 'enabled' : 'disabled');

    res.json(result);
  } catch (error) {
    log.error(`Failed to set noclip: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
