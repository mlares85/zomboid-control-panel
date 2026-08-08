import express from "express";
import { createLogger } from "../../../utils/logger.js";

const log = createLogger("API:Debug");
const router = express.Router();

// POST /client-errors - Accept frontend error reports for server-side logging
// Production builds can't console.error, so this makes client crashes visible.
const CLIENT_ERROR_RATE = new Map(); // IP -> { count, resetAt }
const CLIENT_ERROR_MAX = 30; // max reports per minute per IP
// Entries expire logically but were never removed, so every distinct client IP
// left a permanent entry. Sweep expired ones once the map gets large.
const CLIENT_ERROR_RATE_MAX_ENTRIES = 5000;

router.post("/client-errors", (req, res) => {
  try {
    // Simple per-IP rate limit to prevent abuse
    const ip = req.ip || "unknown";
    const now = Date.now();
    if (CLIENT_ERROR_RATE.size > CLIENT_ERROR_RATE_MAX_ENTRIES) {
      for (const [key, tracked] of CLIENT_ERROR_RATE) {
        if (now > tracked.resetAt) CLIENT_ERROR_RATE.delete(key);
      }
    }
    const entry = CLIENT_ERROR_RATE.get(ip) || {
      count: 0,
      resetAt: now + 60000,
    };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 60000;
    }
    entry.count++;
    CLIENT_ERROR_RATE.set(ip, entry);
    if (entry.count > CLIENT_ERROR_MAX) {
      return res.status(429).json({ error: "Too many error reports" });
    }

    const { message, error: errorDetail, url } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    log.warn(`[ClientError] ${message.slice(0, 500)}`, {
      error:
        typeof errorDetail === "string"
          ? errorDetail.slice(0, 1000)
          : undefined,
      url: typeof url === "string" ? url.slice(0, 200) : undefined,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to process error report" });
  }
});

export default router;
