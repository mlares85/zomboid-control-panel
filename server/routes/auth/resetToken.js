/**
 * Local-panel detection and the data/reset-token.txt file lifecycle, shared
 * by the local-reset and password-reset routes.
 */

import path from "path";
import fs from "fs";
import os from "os";
import { getDataPaths } from "../../utils/paths.js";

export const RESET_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_MAX_BYTES = 1024;
const LOOPBACK_REMOTE_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

function normalizeIpAddress(address) {
  if (typeof address !== "string") return "";
  const trimmed = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!trimmed) return "";
  const withoutZone = trimmed.split("%")[0];
  return withoutZone.startsWith("::ffff:") ? withoutZone.slice(7) : withoutZone;
}

function isDockerBridgeAddress(address) {
  const match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address);
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first === 172 && second >= 16 && second <= 31;
}

function getLocalPanelAddresses() {
  const addresses = new Set(
    [...LOOPBACK_REMOTE_ADDRESSES]
      .map((address) => normalizeIpAddress(address))
      .filter(Boolean),
  );

  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      const normalized = normalizeIpAddress(entry.address);
      if (normalized && !isDockerBridgeAddress(normalized)) {
        addresses.add(normalized);
      }
    }
  }

  return addresses;
}

export function getResetTokenPath() {
  const { dataDir } = getDataPaths();
  return path.join(dataDir, "reset-token.txt");
}

export function isLocalPanelRequest(req) {
  // Behind a reverse proxy the socket peer is always the proxy itself, so
  // we cannot distinguish a local caller from a remote one — trusting a
  // forwarded header would let a remote caller spoof local trust. Fail
  // closed: no request is treated as local while trust proxy is on.
  // Upstream: 37e73c4.
  if (req.app?.get("trust proxy")) return false;

  const candidateAddresses = [
    req.socket?.remoteAddress,
    req.connection?.remoteAddress,
  ]
    .map((address) => normalizeIpAddress(address))
    .filter(Boolean);

  const localAddresses = getLocalPanelAddresses();
  return candidateAddresses.some((address) => localAddresses.has(address));
}

export function createLocalResetResponse(message) {
  return {
    success: true,
    resetAvailable: true,
    message,
  };
}

export function getResetTokenState() {
  const tokenPath = getResetTokenPath();
  if (!fs.existsSync(tokenPath)) {
    return { tokenPath, available: false, reason: "missing", token: null };
  }

  const stat = fs.statSync(tokenPath);
  if (stat.size > RESET_TOKEN_MAX_BYTES) {
    return {
      tokenPath,
      available: false,
      reason: "too-large",
      token: null,
      stat,
    };
  }

  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs > RESET_TOKEN_MAX_AGE_MS) {
    return {
      tokenPath,
      available: false,
      reason: "expired",
      token: null,
      stat,
    };
  }

  const token = fs.readFileSync(tokenPath, "utf-8").trim();
  if (!token || token.length < 8) {
    return {
      tokenPath,
      available: false,
      reason: "too-short",
      token: null,
      stat,
    };
  }

  return { tokenPath, available: true, reason: "ok", token, stat, ageMs };
}
