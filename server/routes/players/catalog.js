import express from 'express';
import { PERKS, PERK_CATALOG, ACCESS_LEVELS } from '../../utils/commands.js';

const router = express.Router();

// Get available perks
router.get('/perks', (req, res) => {
  res.json({ perks: PERKS, catalog: PERK_CATALOG });
});

// Get access levels
router.get('/access-levels', (req, res) => {
  res.json({ levels: ACCESS_LEVELS });
});

export default router;
