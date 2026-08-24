/**
 * Installs PanelBridge.lua onto a remote (provider `remote-sftp`) server over
 * SFTP. Separate from install-mod/install-mod-auto (modInstall.js), which
 * write through the local filesystem and can't reach a host the panel has
 * no local path into.
 */

import express from "express";
import { sanitizeError } from "../../utils/sanitize.js";
import { requireRole } from "../../services/auth.js";
import { installBridgeViaSftp } from "../../services/panelBridgeSftpInstaller.js";

const router = express.Router();

const REQUIRED_FIELDS = ["host", "port", "username", "password", "installPath"];

function missingField(body) {
  return REQUIRED_FIELDS.find((field) => {
    const value = body?.[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

router.post("/install-sftp", requireRole("admin"), async (req, res) => {
  const missing = missingField(req.body);
  if (missing) {
    return res.status(400).json({ success: false, error: `${missing} is required` });
  }

  try {
    const { host, port, username, password, installPath } = req.body;
    const result = await installBridgeViaSftp({ host, port, username, password }, installPath);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: sanitizeError(error.message) });
  }
});

export default router;
