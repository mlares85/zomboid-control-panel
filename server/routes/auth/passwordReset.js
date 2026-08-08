/**
 * File-based password reset — requires filesystem access to the server
 * (data/reset-token.txt), either created remotely by an admin or
 * self-served when the request originates from the server itself.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import crypto from "crypto";
import authService from "../../services/auth.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { log } from "./shared.js";
import {
  RESET_TOKEN_MAX_AGE_MS,
  RESET_TOKEN_MAX_BYTES,
  getResetTokenPath,
  isLocalPanelRequest,
  createLocalResetResponse,
  getResetTokenState,
} from "./resetToken.js";

const router = Router();

// Rate limit for reset — 3 attempts per 15 minutes
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset attempts. Please try again later." },
});

/**
 * GET /api/auth/reset-status
 * Check if a password reset token file exists on disk.
 * This tells the frontend whether to show the "Reset Password" option.
 */
router.get("/reset-status", async (req, res) => {
  try {
    const tokenState = getResetTokenState();
    res.json({
      resetAvailable: tokenState.available,
      localResetSupported: isLocalPanelRequest(req),
    });
  } catch (error) {
    res.json({ resetAvailable: false, localResetSupported: false });
  }
});

const localResetTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many local recovery attempts. Please try again later.",
  },
});

/**
 * POST /api/auth/reset-token/local
 * Create or reuse a reset token when the panel is opened locally on the server host.
 *
 * Security model: this is only allowed for requests that originate from the server itself
 * (loopback or one of the machine's own assigned IP addresses). The response never
 * includes the token value; the caller must still read data/reset-token.txt on disk.
 */
router.post("/reset-token/local", localResetTokenLimiter, async (req, res) => {
  try {
    if (!isLocalPanelRequest(req)) {
      return res.status(403).json({
        error:
          "This recovery action is only available when the panel is opened from the server itself.",
      });
    }

    const tokenState = getResetTokenState();
    if (tokenState.available && tokenState.token) {
      return res.json(
        createLocalResetResponse(
          "A recovery token is already available at data/reset-token.txt. Paste it below to continue.",
        ),
      );
    }

    if (
      tokenState.reason === "expired" ||
      tokenState.reason === "too-large" ||
      tokenState.reason === "too-short"
    ) {
      try {
        fs.unlinkSync(tokenState.tokenPath);
      } catch (error) {
        log.warn(
          `Could not remove ${tokenState.reason} reset token file: ${error.message}`,
        );
      }
    }

    const token = crypto.randomBytes(24).toString("hex");
    fs.writeFileSync(tokenState.tokenPath, `${token}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });

    log.info(
      "Local recovery token created from a request originating on the server",
    );
    res.json(
      createLocalResetResponse(
        "Recovery token created at data/reset-token.txt. Paste it below to continue.",
      ),
    );
  } catch (error) {
    log.error(`Local recovery token creation failed: ${error.message}`);
    res
      .status(500)
      .json({ error: "Could not create a recovery token on this server." });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset the admin password using a reset token file.
 *
 * Security model: The caller must provide the exact token from data/reset-token.txt.
 * This proves they have filesystem access to the server machine.
 * The token file is deleted after a successful reset.
 */
router.post("/reset-password", resetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (
      !token ||
      !newPassword ||
      typeof token !== "string" ||
      typeof newPassword !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "Token and new password are required" });
    }

    if (newPassword.length > 128) {
      return res
        .status(400)
        .json({ error: "Password must be 128 characters or fewer" });
    }

    const tokenPath = getResetTokenPath();

    if (!fs.existsSync(tokenPath)) {
      log.warn("Password reset attempted but no reset-token.txt exists");
      return res
        .status(403)
        .json({
          error:
            "No reset token found. Create data/reset-token.txt on the server first.",
        });
    }

    // Guard against oversized token files
    const stat = fs.statSync(tokenPath);
    if (stat.size > RESET_TOKEN_MAX_BYTES) {
      log.warn("Password reset token file is too large");
      return res
        .status(403)
        .json({ error: "Reset token file is invalid (too large). Max 1KB." });
    }

    // Token files older than 24h are rejected to prevent stale reset files from being abused.
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > RESET_TOKEN_MAX_AGE_MS) {
      log.warn("Password reset attempted with expired token file (>24h old)");
      try {
        fs.unlinkSync(tokenPath);
      } catch (error) {
        log.warn(`Could not remove expired reset token file: ${error.message}`);
      }
      return res
        .status(403)
        .json({
          error:
            "Reset token file is older than 24 hours. Recreate it on the server.",
        });
    }

    const storedToken = fs.readFileSync(tokenPath, "utf-8").trim();
    if (!storedToken || storedToken.length < 8) {
      log.warn("Password reset attempted with invalid token file (too short)");
      return res
        .status(403)
        .json({
          error:
            "Reset token file is invalid. It must contain at least 8 characters.",
        });
    }

    // Hash both sides to a constant-length digest before timing-safe comparison.
    // This avoids leaking the token's length via the length-mismatch short-circuit.
    const candidateDigest = crypto
      .createHash("sha256")
      .update(token.trim(), "utf8")
      .digest();
    const storedDigest = crypto
      .createHash("sha256")
      .update(storedToken, "utf8")
      .digest();
    if (!crypto.timingSafeEqual(candidateDigest, storedDigest)) {
      log.warn("Password reset attempted with incorrect token");
      return res.status(403).json({ error: "Invalid reset token" });
    }

    const result = await authService.resetPassword(newPassword);

    // Delete the token file after successful reset
    try {
      fs.unlinkSync(tokenPath);
    } catch (unlinkErr) {
      log.warn(`Could not delete reset-token.txt: ${unlinkErr.message}`);
    }

    log.info(`Password reset successful for user: ${result.username}`);
    res.json({
      success: true,
      message: `Password reset for ${result.username}`,
    });
  } catch (error) {
    log.error(`Password reset failed: ${error.message}`);
    res.status(400).json({ error: sanitizeError(error.message) });
  }
});

export default router;
