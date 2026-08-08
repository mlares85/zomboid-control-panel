import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { queryServerInfo } from './a2s.js';
import { validateQueryIp } from './ipValidation.js';

const log = createLogger('API:Finder');
const router = express.Router();

/**
 * Query a specific server for its current info
 */
router.get('/query', async (req, res) => {
  const { ip, port } = req.query;
  log.info(`GET /query: ip=${ip}, port=${port}`);

  if (!ip || !port) {
    return res.status(400).json({
      success: false,
      error: 'IP and port are required',
    });
  }

  // Block private/reserved IPs to prevent SSRF
  if (!validateQueryIp(ip)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or disallowed IP address',
    });
  }

  // Validate port is a valid number
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port number',
    });
  }

  try {
    const info = await queryServerInfo(ip, portNum);

    if (!info) {
      return res.status(504).json({
        success: false,
        error: 'Server did not respond',
      });
    }

    res.json({
      success: true,
      server: info,
    });
  } catch (error) {
    log.error('Failed to query server:', error);
    res.status(500).json({
      success: false,
      error: sanitizeError(error.message),
    });
  }
});

export default router;
