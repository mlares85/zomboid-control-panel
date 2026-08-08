import express from 'express';
import { queryServerInfo } from './a2s.js';
import { validateQueryIp } from './ipValidation.js';

const router = express.Router();

/**
 * Ping a server to get latency
 */
router.get('/ping', async (req, res) => {
  const { ip, port } = req.query;

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

  const startTime = Date.now();

  try {
    const info = await queryServerInfo(ip, portNum);
    const ping = Date.now() - startTime;

    if (!info) {
      return res.json({
        success: true,
        ping: null,
        online: false,
      });
    }

    res.json({
      success: true,
      ping,
      online: true,
    });
  } catch (error) {
    res.json({
      success: true,
      ping: null,
      online: false,
    });
  }
});

export default router;
