// Block private/reserved IP ranges to prevent SSRF
export function isPrivateIp(ip) {
  if (typeof ip !== 'string') return true;
  // Trim whitespace
  ip = ip.trim();
  // Block non-IPv4 patterns (no IPv6 support in this feature)
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  const parts = ip.split('.').map(Number);
  if (parts.some(p => p < 0 || p > 255 || isNaN(p))) return true;
  const [a, b] = parts;
  // 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16-31.0.0/12, 192.168.0.0/16, 224-255 (multicast/reserved)
  if (a === 0 || a === 10 || a === 127) return true;
  // 100.64.0.0/10 (RFC 6598, Carrier-Grade NAT / shared address space) --
  // increasingly used as an internal routing range by cloud providers and
  // some Docker/Kubernetes CNI setups, so it needs the same block as the
  // other private ranges above.
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

// Validate IP format for query/ping endpoints
export function validateQueryIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (isPrivateIp(ip)) return false;
  return true;
}
