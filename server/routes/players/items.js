import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { logPlayerAction } from '../../database/init.js';
import { PERKS } from '../../utils/commands.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { isValidUsername, isValidItem, isValidNumber } from './validators.js';

const log = createLogger('API:Players');
const router = express.Router();

// Add item to player
router.post('/add-item', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, item, count } = req.body;

    if (!item) {
      return res.status(400).json({ error: 'Item is required' });
    }

    if (!isValidItem(item)) {
      return res.status(400).json({ error: 'Invalid item format' });
    }

    if (username && !isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    if (count !== undefined && !isValidNumber(count, 1, 100)) {
      return res.status(400).json({ error: 'Invalid count (1-100)' });
    }
    const itemCount = count !== undefined ? Math.min(Math.floor(Number(count)), 100) : 1;

    if (!username) {
      return res.status(400).json({ error: 'A player must be selected to give items' });
    }

    let result;
    // Use RCON for additem — PZ handles inventory sync to client correctly via RCON
    // PanelBridge's inventory:AddItem() works server-side but client doesn't see items until relog
    result = await rconService.addItem(username, item, itemCount);
    log.info(`POST /add-item: ${item} x${itemCount} to ${username} via RCON`);
    if (username) {
      await logPlayerAction(username, 'add_item', `${item} x${itemCount}`);
    }

    res.json(result);
  } catch (error) {
    log.error(`Failed to add item: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Add XP to player
router.post('/add-xp', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { username, perk, amount } = req.body;

    if (!username || !perk || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Username, perk, and amount are required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    if (!PERKS.includes(perk)) {
      return res.status(400).json({ error: `Invalid perk. Valid: ${PERKS.join(', ')}` });
    }

    if (!isValidNumber(amount, 0, 100000)) {
      return res.status(400).json({ error: 'Invalid XP amount (0-100000)' });
    }

    const result = await rconService.addXp(username, perk, amount);
    log.info(`POST /add-xp: ${perk}=${amount} to ${username}`);
    await logPlayerAction(username, 'add_xp', `${perk}=${amount}`);

    res.json(result);
  } catch (error) {
    log.error(`Failed to add XP: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
