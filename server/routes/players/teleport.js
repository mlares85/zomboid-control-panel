import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import bridge from '../../services/panelBridge.js';
import { isValidUsername, isValidNumber } from './validators.js';

const log = createLogger('API:Players');
const router = express.Router();

// Teleport player
router.post('/teleport', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    let { player1, player2, x, y, z } = req.body;

    // Backward compatibility: allow coordinates to be sent as "x,y,z" in player2
    if ((x === undefined || y === undefined || z === undefined) && typeof player2 === 'string' && player2.includes(',')) {
      const parts = player2.split(',').map(part => part.trim());
      if (parts.length >= 2) {
        [x, y] = parts;
        z = parts[2] ?? '0';
        player2 = undefined;
      }
    }

    let result;
    if (x !== undefined && y !== undefined && z !== undefined) {
      // Validate coordinates. B42 vanilla map extends past 16800 and modded maps
      // (Normandy, etc.) go further, so cap at 24000 to match the Lua handler.
      // z is floor level 0-8.
      if (!isValidNumber(x, 0, 24000) || !isValidNumber(y, 0, 24000) || !isValidNumber(z, 0, 8)) {
        return res.status(400).json({ error: 'Invalid coordinates (x/y: 0 to 24000, z: 0 to 8)' });
      }
      if (player1) {
        log.info(`POST /teleport: ${player1} → coords(${x}, ${y}, ${z}) via PanelBridge`);
        // Teleport a specific player to coordinates — requires PanelBridge
        // (RCON 'teleportto' is a self-teleport and doesn't accept a target player)
        if (!isValidUsername(player1)) {
          return res.status(400).json({ error: 'Invalid player1 username format' });
        }
        if (!bridge.isRunning) {
          return res.status(503).json({ error: 'PanelBridge is not running — cannot teleport a player to coordinates without it' });
        }
        result = await bridge.teleportPlayer(player1, Number(x), Number(y), Number(z));
      } else {
        // No target player — admin self-teleport via RCON
        result = await rconService.teleportTo(x, y, z);
      }
    } else if (player1) {
      if (!isValidUsername(player1)) {
        return res.status(400).json({ error: 'Invalid player1 username format' });
      }
      if (player2 && !isValidUsername(player2)) {
        return res.status(400).json({ error: 'Invalid player2 username format' });
      }
      result = await rconService.teleportPlayer(player1, player2);
    } else {
      return res.status(400).json({ error: 'Player name or coordinates required' });
    }

    res.json(result);
  } catch (error) {
    log.error(`Failed to teleport: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
