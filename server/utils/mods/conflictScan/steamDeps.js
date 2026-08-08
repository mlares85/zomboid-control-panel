import { createLogger } from "../../logger.js";
import { getSteamApiKey } from "../../../services/steamApiKey.js";

const log = createLogger("API:Mods");

// ─── Steam API: fetch workshop item dependencies (children) ─────────────────
// Uses GetPublishedFileDetails to get the "Required Items" for each workshop item,
// then checks which required Workshop IDs are missing from the configured list.
// Returns { deps: [...], warnings: [...] }
export async function findSteamDeps(workshopIds) {
  const steamApiKey = await getSteamApiKey();
  if (
    !steamApiKey ||
    typeof steamApiKey !== "string" ||
    steamApiKey.length < 10
  )
    return {
      deps: [],
      warnings: [
        "Steam API key not configured — dependency check skipped. Set it in Settings to enable.",
      ],
    };

  const configuredWsIds = new Set(workshopIds.map(String));
  const allDeps = [];
  const steamWarnings = [];
  let steamApiFailed = false;

  // Batch in groups of 50 (Steam API limit)
  for (let i = 0; i < workshopIds.length; i += 50) {
    const batch = workshopIds.slice(i, i + 50);
    const params = new URLSearchParams({
      key: steamApiKey,
      includechildren: "true",
    });
    batch.forEach((id, idx) =>
      params.append(`publishedfileids[${idx}]`, String(id)),
    );
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(
        `https://api.steampowered.com/IPublishedFileService/GetDetails/v1/?${params}`,
        {
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);
      if (!response.ok) {
        steamApiFailed = true;
        continue;
      }
      const data = await response.json();
      const details = data.response?.publishedfiledetails || [];
      for (const item of details) {
        if (!item.publishedfileid || !item.children?.length) continue;
        const parentWsId = String(item.publishedfileid);
        const parentName = item.title || `Workshop ${parentWsId}`;
        for (const child of item.children) {
          // file_type 0 = required item dependency
          if (child.file_type !== 0) continue;
          const childWsId = String(child.publishedfileid);
          if (!configuredWsIds.has(childWsId)) {
            allDeps.push({
              parentWorkshopId: parentWsId,
              parentName,
              childWorkshopId: childWsId,
              childName: null, // resolved in next batch
              source: "steam",
            });
          }
        }
      }
    } catch (e) {
      steamApiFailed = true;
      log.debug?.(`Steam deps batch failed (non-fatal): ${e.message}`);
    }
  }

  if (steamApiFailed) {
    steamWarnings.push(
      "Steam Workshop API was unreachable — dependency check may be incomplete",
    );
  }

  // Resolve child names in a single batch call
  const childIds = [...new Set(allDeps.map((d) => d.childWorkshopId))];
  if (childIds.length > 0) {
    for (let i = 0; i < childIds.length; i += 50) {
      const batch = childIds.slice(i, i + 50);
      const params = new URLSearchParams({ key: steamApiKey });
      batch.forEach((id, idx) => params.append(`publishedfileids[${idx}]`, id));
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(
          `https://api.steampowered.com/IPublishedFileService/GetDetails/v1/?${params}`,
          {
            signal: controller.signal,
          },
        );
        clearTimeout(timeout);
        if (!response.ok) continue;
        const data = await response.json();
        const details = data.response?.publishedfiledetails || [];
        const nameMap = new Map();
        for (const item of details) {
          if (item.publishedfileid && item.title) {
            nameMap.set(String(item.publishedfileid), item.title);
          }
        }
        for (const dep of allDeps) {
          if (!dep.childName && nameMap.has(dep.childWorkshopId)) {
            dep.childName = nameMap.get(dep.childWorkshopId);
          }
        }
      } catch (e) {
        log.debug(
          `Steam deps batch name lookup failed (non-fatal): ${e.message}`,
        );
      }
    }
  }

  // Fill in fallback names
  for (const dep of allDeps) {
    if (!dep.childName) dep.childName = `Workshop Item #${dep.childWorkshopId}`;
  }

  // Deduplicate (same child can be required by multiple parents)
  const seen = new Set();
  const deps = allDeps.filter((d) => {
    const key = `${d.parentWorkshopId}-${d.childWorkshopId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { deps, warnings: steamWarnings };
}
