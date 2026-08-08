/**
 * Shared helpers for the auth routes — cookie options, validation, and
 * access-token lookup used across the session/recovery/reset sub-routers.
 */

import authService from "../../services/auth.js";
import { createLogger } from "../../utils/logger.js";

export const log = createLogger("Auth");

// Force all refresh cookies to be Secure when the operator has explicitly
// declared this deployment is HTTPS-only (VPS behind TLS termination).
const forceSecureCookies =
  process.env.HTTPS === "true" || process.env.FORCE_HSTS === "true";

export function getRefreshCookieOptions(req, includeMaxAge = true) {
  // Decide `secure` from THIS request's own protocol, not a shared global
  // latch. The latch previously flipped on permanently the first time ANY
  // client was seen over HTTPS, after which every plain-HTTP LAN client
  // silently stopped receiving the refresh cookie (browsers drop `Secure`
  // cookies set over HTTP) — with no error to explain why. In a mixed
  // LAN(HTTP)+remote(HTTPS) deployment each request now gets the right flag
  // for its own connection.
  const requestIsSecure =
    req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    secure: forceSecureCookies || requestIsSecure,
    sameSite: "strict",
    path: "/api/auth",
    ...(includeMaxAge ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}),
  };
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authService.authenticateAccessToken(authHeader.substring(7));
}
