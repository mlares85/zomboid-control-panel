import os from "os";
import net from "net";

// How long a live-looked-up public IP is trusted before re-checking.
// Residential ISPs rotate dynamic WAN IPs periodically; without a TTL the
// dashboard would show a stale, no-longer-yours address indefinitely.
export const PUBLIC_IP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function getConfiguredIpv4Address(variableName) {
  const address = process.env[variableName]?.trim();
  return address && net.isIP(address) === 4 ? address : null;
}

// All non-internal IPv4 addresses currently present on the host, e.g. one
// per VPN mesh (Tailscale, ZeroTier) plus the real LAN adapter — so the
// Settings UI can offer a choice instead of the panel guessing.
export function listNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        result.push({ name, address: iface.address });
      }
    }
  }
  return result;
}

export async function getLocalIp(getSetting) {
  const interfaces = listNetworkInterfaces();

  // A user-picked interface (Settings > Network) wins over the env var:
  // it's the more recent, explicit choice. But only while that address is
  // still actually present, so an unplugged VPN doesn't leave the
  // dashboard stuck showing a dead IP forever.
  try {
    const selected = await getSetting("lanIpAddress");
    if (selected && interfaces.some((iface) => iface.address === selected)) {
      return selected;
    }
  } catch {
    /* ignore */
  }

  const configuredLanIp = getConfiguredIpv4Address("PANEL_LAN_IP");
  if (configuredLanIp) return configuredLanIp;

  return interfaces[0]?.address || "127.0.0.1";
}

export async function fetchPublicIp(setSetting) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    // Cache to DB so we don't need to call out to ipify again on every
    // restart — only when the cached value is missing or stale (see
    // getServerStatus's PUBLIC_IP_CACHE_TTL_MS check).
    try {
      await setSetting("cachedPublicIp", data.ip);
      await setSetting("cachedPublicIpAt", String(Date.now()));
    } catch {
      /* best effort */
    }
    return data.ip;
  } catch {
    return null;
  }
}
