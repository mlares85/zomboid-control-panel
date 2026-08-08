import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { logPlayerAction } from '../../database/init.js';
import { VEHICLES } from '../../utils/commands.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { isValidUsername } from './validators.js';

const log = createLogger('API:Players');
const router = express.Router();

// Spawn vehicle
router.post('/add-vehicle', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { vehicle, username } = req.body;

    if (!vehicle) {
      return res.status(400).json({ error: 'Vehicle is required' });
    }

    // Validate vehicle ID format (e.g., "Base.CarNormal", "mod.VehicleName")
    // Allows catalog-scanned vehicles beyond the static VEHICLES list
    if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(vehicle)) {
      return res.status(400).json({ error: 'Invalid vehicle ID format' });
    }

    if (username && !isValidUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = await rconService.addVehicle(vehicle, username);
    log.info(`POST /add-vehicle: ${vehicle} for ${username || 'self'}`);
    if (username) {
      await logPlayerAction(username, 'add_vehicle', vehicle);
    }

    res.json(result);
  } catch (error) {
    log.error(`Failed to spawn vehicle: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Spawn a vehicle at a map coordinate (Build 42 uses RCON for this operation).
router.post('/add-vehicle-at', async (req, res) => {
  try {
    const rconService = req.app.get('rconService');
    const { vehicle, x, y, z = 0 } = req.body;

    if (!vehicle || !/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(vehicle)) {
      return res.status(400).json({ error: 'Invalid vehicle ID format' });
    }

    const coordinates = [x, y, z].map(Number);
    if (!coordinates.every(Number.isFinite) || x < 0 || x > 24000 || y < 0 || y > 24000 || z < 0 || z > 8) {
      return res.status(400).json({ error: 'Invalid map coordinates' });
    }

    const result = await rconService.addVehicleAt(vehicle, x, y, z);
    log.info(`POST /add-vehicle-at: ${vehicle} at ${coordinates.map(Math.floor).join(',')}`);
    res.json(result);
  } catch (error) {
    log.error(`Failed to spawn vehicle at coordinate: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

// Get available vehicles
router.get('/vehicles', (req, res) => {
  res.json({ vehicles: VEHICLES });
});

export default router;
