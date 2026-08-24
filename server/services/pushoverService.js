import https from "https";
import { createLogger } from "../utils/logger.js";

const log = createLogger("PushoverService");

const API_HOST = "api.pushover.net";
const API_PATH = "/1/messages.json";
// Required by the Pushover API whenever priority=2 (emergency): how often
// to re-notify (seconds) and how long to keep retrying before giving up.
const EMERGENCY_RETRY_SECONDS = 30;
const EMERGENCY_EXPIRE_SECONDS = 3600;

/**
 * Thin client for the Pushover push notification API. Uses Node's built-in
 * https module (no fetch/axios) so it works in the pkg-bundled runtime this
 * panel ships as.
 */
export class PushoverService {
  constructor({ userKey, apiToken }) {
    this.userKey = userKey;
    this.apiToken = apiToken;
  }

  /** Send a push notification. priority ranges -2 (silent) to 2 (emergency). */
  async sendNotification({ title, message, priority = 0, sound } = {}) {
    if (!this.userKey || !this.apiToken) {
      return { success: false, error: "Pushover is not configured (missing userKey/apiToken)" };
    }
    if (!message) {
      return { success: false, error: "message is required" };
    }
    return this._post(this._buildParams({ title, message, priority, sound }));
  }

  /** Send a quiet (priority -2) test push to confirm the credentials work. */
  async validateConfig() {
    return this.sendNotification({
      title: "Zomboid Control Panel",
      message: "Pushover is configured correctly.",
      priority: -2,
    });
  }

  _buildParams({ title, message, priority, sound }) {
    const params = { token: this.apiToken, user: this.userKey, message, priority: String(priority) };
    if (title) params.title = title;
    if (sound) params.sound = sound;
    if (priority === 2) {
      params.retry = String(EMERGENCY_RETRY_SECONDS);
      params.expire = String(EMERGENCY_EXPIRE_SECONDS);
    }
    return params;
  }

  _post(params) {
    const body = new URLSearchParams(params).toString();
    return new Promise((resolve) => {
      const req = https.request(this._requestOptions(body), (res) => this._handleResponse(res, resolve));
      req.on("error", (err) => {
        log.error(`Pushover request failed: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
      req.write(body);
      req.end();
    });
  }

  _requestOptions(body) {
    return {
      hostname: API_HOST,
      path: API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };
  }

  _handleResponse(res, resolve) {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => resolve(parsePushoverResponse(res.statusCode, data)));
  }
}

/** Pure: turn a raw HTTP status + body into our {success} result shape. */
function parsePushoverResponse(statusCode, data) {
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { success: false, error: `Invalid response from Pushover (status ${statusCode})` };
  }
  if (statusCode !== 200 || parsed.status !== 1) {
    const errors = Array.isArray(parsed.errors) ? parsed.errors.join(", ") : null;
    return { success: false, error: errors || `Pushover returned status ${statusCode}` };
  }
  return { success: true, request: parsed.request };
}
