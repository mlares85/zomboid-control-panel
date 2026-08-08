import { createLogger } from "../logger.js";

const log = createLogger("API:Mods");

// Helper function to fetch mod ID from Steam Workshop page description
export async function fetchModIdFromWorkshop(workshopId) {
  try {
    // First, get the mod description from Steam API
    const fetchAbort = new AbortController();
    const fetchTimer = setTimeout(() => fetchAbort.abort(), 15000);
    let response;
    try {
      response = await fetch(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            itemcount: "1",
            "publishedfileids[0]": workshopId,
          }),
          signal: fetchAbort.signal,
        },
      );
    } finally {
      clearTimeout(fetchTimer);
    }

    if (!response.ok) {
      log.warn(
        `Steam API returned ${response.status} for workshop ${workshopId}`,
      );
      return null;
    }

    const data = await response.json();
    const modInfo = data.response?.publishedfiledetails?.[0];

    if (!modInfo || modInfo.result !== 1) {
      log.warn(`Mod not found for workshop ${workshopId}`);
      return null;
    }

    const description = modInfo.description || "";
    const title = modInfo.title || "";

    // Try various patterns to find the mod ID in the description
    // Pattern 1: "Mod ID: SomeName" or "ModID: SomeName"
    let match = description.match(/Mod\s*ID\s*[:=]\s*([^\s\n\r\[\]<>]+)/i);
    if (match) {
      log.info(`Found Mod ID from "Mod ID:" pattern: ${match[1]}`);
      return match[1].trim();
    }

    // Pattern 2: "id=SomeName" (common in description)
    match = description.match(/\bid\s*=\s*([^\s\n\r\[\]<>]+)/i);
    if (match) {
      log.info(`Found Mod ID from "id=" pattern: ${match[1]}`);
      return match[1].trim();
    }

    // Pattern 3: Workshop ID matches a pattern like "Mod: ModName"
    match = description.match(/\bMod\s*:\s*([A-Za-z0-9_-]+)/i);
    if (match && match[1].length > 3) {
      log.info(`Found Mod ID from "Mod:" pattern: ${match[1]}`);
      return match[1].trim();
    }

    // Pattern 4: Look for [code] blocks that might contain mod.info content
    // Use [\s\S] to match newlines
    match = description.match(
      /\[code\][\s\S]*?id\s*=\s*([^\s\n\r\[\]]+)[\s\S]*?\[\/code\]/i,
    );
    if (match) {
      log.info(`Found Mod ID from [code] block: ${match[1]}`);
      return match[1].trim();
    }

    // Pattern 5: "Ids: ModId" (plural)
    match = description.match(/IDs\s*[:=]\s*([^\s\n\r\[\]<>]+)/i);
    if (match) {
      log.info(`Found Mod ID from "IDs:" pattern: ${match[1]}`);
      return match[1].trim();
    }

    // Pattern 6: If specific workshop ID is mentioned near "Mod ID"
    // Sometimes description has multiple mods, but we want the one for THIS item?
    // Usually one workshop item = one mod, but obscure cases exist.

    // Pattern 7: Fallback - Title as Mod ID if looks like ID
    // Only use if the title is already a clean ID-like string (no spaces, special chars)
    const potentialId = title.replace(/[^a-zA-Z0-9_-]/g, "");
    if (
      potentialId === title &&
      potentialId.length > 3 &&
      potentialId.length < 30
    ) {
      log.info(`Using title as Mod ID (exact match): ${potentialId}`);
      return potentialId;
    }

    log.warn(
      `Could not extract Mod ID from workshop ${workshopId} description. Title: "${title}"`,
    );
    return null;
  } catch (error) {
    log.error(
      `Error fetching mod ID from workshop ${workshopId}: ${error.message}`,
    );
    return null;
  }
}
