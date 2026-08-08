import { sanitizeIniValue, looksLikeWorkshopId } from "../sanitize.js";

// Filters a client-supplied list of "known mod IDs" down to only the ones
// that are verified to belong to this workshop item (ownedModIds, resolved
// server-side from mod.info). Used as a last-resort fallback when server-side
// detection fails — never trusts the client list outright.
export function filterOwnedClientModIds(clientModIds, ownedModIds) {
  const ownedSet = new Set((ownedModIds || []).map(String));
  if (!ownedSet.size || !Array.isArray(clientModIds)) return [];

  const filtered = [];
  const seen = new Set();
  for (const rawId of clientModIds) {
    if (typeof rawId !== "string") continue;
    const modId = sanitizeIniValue(rawId).trim();
    if (!modId || modId.length >= 200) continue;
    if (looksLikeWorkshopId(modId)) continue;
    if (!ownedSet.has(modId) || seen.has(modId)) continue;
    seen.add(modId);
    filtered.push(modId);
  }
  return filtered;
}
