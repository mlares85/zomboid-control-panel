import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../../../utils/logger.js";
import { sanitizeError } from "../../../utils/sanitize.js";
import { getSteamApiKey } from "../../../services/steamApiKey.js";
import { getServerPath } from "../../../utils/mods/serverConfig.js";
import { getModDetailsFromWorkshop } from "../../../utils/mods/workshopModInfo.js";
import { scoreWorkshopDependencyMatch } from "../../../utils/mods/workshopScore.js";
import { buildSearchVariants, scoreSteamSearchCandidate } from "../../../utils/mods/searchVariants.js";

const log = createLogger("API:Mods");
const router = express.Router();

// ─── Missing Dependencies: Search Steam Workshop for a mod by name ──────────
router.post("/search-workshop-mods", async (req, res) => {
  try {
    const { query, parentName, parentWorkshopId, parentModId } = req.body;
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "Query must be at least 2 characters" });
    }

    const trimmed = query.trim();
    if (trimmed.length > 100) {
      log.debug(`Search query truncated from ${trimmed.length} to 100 chars`);
    }
    const searchTerm = trimmed.substring(0, 100);
    const parentNameClean =
      typeof parentName === "string" ? parentName.trim().substring(0, 100) : "";
    const parentWsClean =
      typeof parentWorkshopId === "string" &&
      /^\d{1,15}$/.test(parentWorkshopId)
        ? parentWorkshopId
        : "";
    const parentModClean =
      typeof parentModId === "string" && parentModId.length < 100
        ? parentModId
        : "";
    const serverPath = await getServerPath();
    const searchVariants = buildSearchVariants(searchTerm, parentNameClean);

    // Phase 1: Search locally downloaded mods — match by mod ID (exact or partial) and mod name
    const localResults = [];
    const seenWorkshopIds = new Set();
    let hasExactLocalMatch = false;
    if (serverPath) {
      const workshopPaths = [
        path.join(serverPath, "steamapps", "workshop", "content", "108600"),
        path.join(
          serverPath,
          "..",
          "steamapps",
          "workshop",
          "content",
          "108600",
        ),
      ];
      for (const workshopBase of workshopPaths) {
        if (!fs.existsSync(workshopBase)) continue;
        try {
          for (const entry of fs.readdirSync(workshopBase, {
            withFileTypes: true,
          })) {
            if (!entry.isDirectory()) continue;
            if (localResults.length >= 20) break;
            // Don't suggest the parent mod itself as a candidate for its own dependency
            if (parentWsClean && entry.name === parentWsClean) continue;
            try {
              const details = getModDetailsFromWorkshop(entry.name, serverPath);
              for (const mod of details) {
                if (parentModClean && mod.id === parentModClean) continue;
                const scored = scoreWorkshopDependencyMatch(
                  searchTerm,
                  mod.id,
                  mod.name,
                );
                if (scored.score > 0) {
                  if (!seenWorkshopIds.has(`${entry.name}-${mod.id}`)) {
                    seenWorkshopIds.add(`${entry.name}-${mod.id}`);
                    localResults.push({
                      workshopId: entry.name,
                      modId: mod.id,
                      modName: mod.name,
                      source: "local",
                      isDownloaded: true,
                      exactMatch: scored.matchType === "exact-id",
                      matchType: scored.matchType,
                      relevance: scored.score,
                    });
                  }
                }
              }
            } catch (e) {
              log.debug(`Error scanning mod entry during search: ${e.message}`);
            }
          }
        } catch (e) {
          log.debug(`Error reading workshop dir during search: ${e.message}`);
        }
        if (localResults.length >= 20) break;
      }
      // If the required internal ID exists locally, keep the answer sharp:
      // exact ID candidates are what the admin needs to add. Prefix/contains
      // matches are useful only when no exact ID is available.
      const exactLocalMatches = localResults.filter(
        (result) => result.matchType === "exact-id",
      );
      if (exactLocalMatches.length > 0) {
        hasExactLocalMatch = true;
        localResults.splice(0, localResults.length, ...exactLocalMatches);
      }

      // Sort: strongest match first, then popularity-ish stable name order.
      localResults.sort((a, b) => {
        if ((b.relevance || 0) !== (a.relevance || 0))
          return (b.relevance || 0) - (a.relevance || 0);
        return a.modName.localeCompare(b.modName);
      });
    }

    // Phase 2: Try Steam API lookup if the query looks like a workshop ID
    const steamResults = [];
    if (/^\d{5,15}$/.test(searchTerm)) {
      // Skip if already found locally
      const alreadyFoundLocally = localResults.some(
        (r) => r.workshopId === searchTerm,
      );
      if (!alreadyFoundLocally) {
        try {
          const response = await fetch(
            "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                itemcount: "1",
                "publishedfileids[0]": searchTerm,
              }),
            },
          );
          if (response.ok) {
            const data = await response.json();
            const info = data.response?.publishedfiledetails?.[0];
            if (info && info.result === 1) {
              steamResults.push({
                workshopId: info.publishedfileid,
                modName: info.title,
                description: info.description?.substring(0, 200),
                subscriberCount: info.subscriptions || 0,
                source: "steam",
                isDownloaded: false,
              });
            }
          }
        } catch (e) {
          log.debug(`Steam collection lookup failed (non-fatal): ${e.message}`);
        }
      }
    }

    // Phase 3: Steam Workshop text search via IPublishedFileService/QueryFiles (requires API key).
    // Tries each query variant until enough candidates are found. We keep going
    // even when local matches exist for short queries, since a one-word mod ID
    // may have come from a sibling mod that happens to share the substring.
    let steamSearchEnabled = false;
    let steamSearchAttempted = false;
    if (!/^\d{5,15}$/.test(searchTerm) && !hasExactLocalMatch) {
      try {
        const steamApiKey = await getSteamApiKey();
        if (
          steamApiKey &&
          typeof steamApiKey === "string" &&
          steamApiKey.length > 10
        ) {
          steamSearchEnabled = true;
          // Score candidates so the most likely match floats to the top: exact
          // ID/name match first, then prefix/contains, then sub count tiebreak.
          const lowerOriginal = searchTerm.toLowerCase();
          const scoreCandidate = (title) =>
            scoreSteamSearchCandidate(title, lowerOriginal);

          const seenSteamIds = new Set([
            ...localResults.map((r) => r.workshopId),
            ...steamResults.map((r) => r.workshopId),
          ]);
          if (parentWsClean) seenSteamIds.add(parentWsClean);
          const collected = []; // { workshopId, modName, description, subscriberCount, score, variant }
          const targetCount = 12;

          for (const variant of searchVariants) {
            if (collected.length >= targetCount) break;
            steamSearchAttempted = true;
            const params = new URLSearchParams({
              key: steamApiKey,
              query_type: "12", // k_PublishedFileQueryType_RankedByTextSearch
              page: "1",
              numperpage: "15",
              appid: "108600", // Project Zomboid
              search_text: variant,
              return_short_description: "true",
              return_metadata: "true",
            });
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const response = await fetch(
                `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params}`,
                {
                  signal: controller.signal,
                },
              );
              clearTimeout(timeout);
              if (!response.ok) continue;
              const data = await response.json();
              const files = data.response?.publishedfiledetails || [];
              for (const item of files) {
                if (!item.publishedfileid || item.result !== 1) continue;
                const wsId = String(item.publishedfileid);
                if (seenSteamIds.has(wsId)) continue;
                seenSteamIds.add(wsId);
                const title = item.title || `Workshop ${wsId}`;
                const desc = item.short_description?.substring(0, 200) || "";
                const score =
                  scoreCandidate(title) +
                  Math.min(50, Math.log10((item.subscriptions || 0) + 1) * 10);
                collected.push({
                  workshopId: wsId,
                  modName: title,
                  description: desc,
                  subscriberCount: item.subscriptions || 0,
                  score,
                  matchedVariant: variant,
                });
              }
            } catch (e) {
              log.debug?.(
                `Steam text search variant "${variant}" failed (non-fatal): ${e.message}`,
              );
            }
          }

          // Sort by score and keep the strongest matches
          collected.sort((a, b) => b.score - a.score);
          for (const c of collected.slice(0, targetCount)) {
            steamResults.push({
              workshopId: c.workshopId,
              modName: c.modName,
              description: c.description,
              subscriberCount: c.subscriberCount,
              source: "steam",
              isDownloaded: false,
              matchedVariant: c.matchedVariant,
              relevance: c.score,
            });
          }
        }
      } catch (e) {
        log.debug?.(`Steam text search failed (non-fatal): ${e.message}`);
      }
    }

    res.json({
      success: true,
      query: searchTerm,
      variantsTried: searchVariants,
      steamSearchEnabled,
      steamSearchAttempted,
      results: [...localResults, ...steamResults],
      searchUrl: `https://steamcommunity.com/workshop/browse/?appid=108600&searchtext=${encodeURIComponent(searchTerm)}`,
    });
  } catch (error) {
    log.error(`Workshop search failed: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
