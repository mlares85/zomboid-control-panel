import { diagFail, diagOk, diagWarn } from "../../diagHelpers.js";
import { FS_TIMEOUT_MS, withTimeout } from "../../fsProbe.js";
import { scanLocalMods, scanWorkshopMods } from "../../modScan.js";

// Cross-checks the parsed server.ini against what's actually installed:
// unresolved Mods= entries, misplaced numeric Workshop IDs, orphan/dead
// WorkshopItems=, duplicate entries, and Map= validity.
export async function checkModsConsistency(checks, ini, installPath, zPath) {
  if (ini && installPath) {
    // Resolve every Mods= entry to either a Workshop mod folder or a
    // local mod folder. Anything unresolved means "this mod will not
    // load" — silent and one of the most painful PZ-server gotchas.
    const [wsScan, localScan] = await Promise.all([
      withTimeout(
        scanWorkshopMods(installPath),
        FS_TIMEOUT_MS,
        new Map(),
      ),
      withTimeout(scanLocalMods(zPath), FS_TIMEOUT_MS, {
        mods: new Set(),
        maps: new Set(),
      }),
    ]);
    const wsModNames = new Set();
    const wsMapNames = new Set();
    for (const v of wsScan.values()) {
      for (const m of v.mods) wsModNames.add(m);
      for (const m of v.maps) wsMapNames.add(m);
    }

    const allUnresolved = ini.Mods.filter(
      (m) => !wsModNames.has(m) && !localScan.mods.has(m),
    );
    // Numeric "Mods=" entries are almost always Workshop IDs that the
    // user pasted into the wrong field. They can never resolve as mod
    // folder names, so flag them separately with a safe auto-fix.
    const numericInMods = allUnresolved.filter((m) => /^\d{5,}$/.test(m));
    const unresolvedMods = allUnresolved.filter(
      (m) => !/^\d{5,}$/.test(m),
    );

    if (numericInMods.length > 0) {
      const shown = numericInMods.slice(0, 5).join(", ");
      const list =
        numericInMods.length > 5
          ? `${shown}, +${numericInMods.length - 5} more`
          : shown;
      const plural = numericInMods.length === 1 ? "y" : "ies";
      checks.push(
        diagWarn(
          "mods.numericInMods",
          "Workshop IDs misplaced in Mods=",
          `${numericInMods.length} numeric entr${plural} in Mods= look like Workshop IDs, not mod folder names: ${list}. These belong in WorkshopItems= and will never load from Mods=.`,
          {
            category: "server",
            hint: "Remove these from Mods= and add them to WorkshopItems= instead.",
            meta: { numericInMods },
          },
        ),
      );
    }

    if (allUnresolved.length === 0 && ini.Mods.length > 0) {
      checks.push(
        diagOk(
          "mods.resolved",
          "Mods= entries all resolve",
          `${ini.Mods.length} mod${ini.Mods.length === 1 ? "" : "s"} listed, all match an installed Workshop or local mod folder.`,
          { category: "server" },
        ),
      );
    } else if (unresolvedMods.length > 0) {
      const shown = unresolvedMods.slice(0, 5).join(", ");
      const list =
        unresolvedMods.length > 5
          ? `${shown}, +${unresolvedMods.length - 5} more`
          : shown;
      checks.push(
        diagFail(
          "mods.resolved",
          "Mods= entries do not resolve",
          `${unresolvedMods.length} of ${ini.Mods.length} Mods= entries don't match any installed mod folder: ${list}.`,
          {
            category: "server",
            hint: "Usually a typo, missing WorkshopItems= ID, or the mod hasn't finished downloading. Fix in Server Config.",
            meta: { unresolvedMods },
          },
        ),
      );
    }

    // WorkshopItems= entries that don't appear in Mods= are subscribed
    // but disabled — usually intentional, sometimes a bug. Warn quietly.
    const modSet = new Set(ini.Mods);
    const orphanWorkshop = [];
    // Also flag IDs in WorkshopItems= that don't exist on disk at all —
    // these are "dead subscriptions" that will never load and just waste
    // Steam bandwidth on every server start.
    const deadWorkshop = [];
    for (const id of ini.WorkshopItems) {
      if (!/^\d{1,15}$/.test(id)) continue;
      const v = wsScan.get(id);
      if (!v) {
        // Subscribed but no folder on disk → dead.
        deadWorkshop.push(id);
        continue;
      }
      const provides = [...v.mods, ...v.maps];
      if (provides.length === 0) continue;
      if (!provides.some((name) => modSet.has(name)))
        orphanWorkshop.push(id);
    }
    if (orphanWorkshop.length > 0 || deadWorkshop.length > 0) {
      const all = [...orphanWorkshop, ...deadWorkshop];
      const shown = all.slice(0, 5).join(", ");
      const list =
        all.length > 5 ? `${shown}, +${all.length - 5} more` : shown;
      const parts = [];
      if (orphanWorkshop.length)
        parts.push(
          `${orphanWorkshop.length} downloaded but not in Mods=`,
        );
      if (deadWorkshop.length)
        parts.push(
          `${deadWorkshop.length} not on disk (dead subscription)`,
        );
      checks.push(
        diagWarn(
          "mods.orphanWorkshop",
          "Subscribed Workshop items not enabled",
          `${all.length} Workshop item${all.length === 1 ? " is" : "s are"} listed in WorkshopItems= but won't load: ${parts.join(", ")}. IDs: ${list}.`,
          {
            category: "server",
            hint: "Auto-fix triages each ID: downloaded → resolves and adds to Mods=; ignored or missing → removes from WorkshopItems=.",
            meta: {
              orphanWorkshop: all,
              downloadedOrphans: orphanWorkshop,
              deadOrphans: deadWorkshop,
            },
          },
        ),
      );
    }

    // Duplicate Mods= / WorkshopItems= entries (cosmetic but confusing).
    const dupMods = ini.Mods.filter((m, i, a) => a.indexOf(m) !== i);
    const dupWs = ini.WorkshopItems.filter(
      (m, i, a) => a.indexOf(m) !== i,
    );
    if (dupMods.length || dupWs.length) {
      const parts = [];
      if (dupMods.length)
        parts.push(
          `${dupMods.length} duplicate Mods= entr${dupMods.length === 1 ? "y" : "ies"}`,
        );
      if (dupWs.length)
        parts.push(
          `${dupWs.length} duplicate WorkshopItems= entr${dupWs.length === 1 ? "y" : "ies"}`,
        );
      checks.push(
        diagWarn(
          "mods.duplicates",
          "Duplicate mod entries",
          `${parts.join(", ")} in the server config.`,
          {
            category: "server",
            hint: "Tidy up Server Config — duplicates can confuse mod-load order.",
            meta: {
              dupMods: [...new Set(dupMods)],
              dupWs: [...new Set(dupWs)],
            },
          },
        ),
      );
    }

    // Map= validity. `Muldraugh, KY` is the built-in base map; everything
    // else has to come from a mod's media/maps/ folder. Match case-
    // insensitively because PZ's Windows resolver is case-insensitive
    // and many map mods use mixed case folder names.
    const BUILTIN_MAPS = new Set(["Muldraugh, KY"]);
    const mapNamesKnownLower = new Set();
    for (const m of BUILTIN_MAPS) mapNamesKnownLower.add(m.toLowerCase());
    for (const m of wsMapNames) mapNamesKnownLower.add(m.toLowerCase());
    for (const m of localScan.maps)
      mapNamesKnownLower.add(m.toLowerCase());
    // Build a lowercase set of every *mod folder name* so we can detect
    // the classic confusion: "I put my mod name in Map=" (it belongs in
    // Mods= only).
    const modNamesKnownLower = new Set();
    for (const m of wsModNames) modNamesKnownLower.add(m.toLowerCase());
    for (const m of localScan.mods)
      modNamesKnownLower.add(m.toLowerCase());

    const missingMaps = ini.Map.filter(
      (m) => !mapNamesKnownLower.has(m.toLowerCase()),
    );
    if (ini.Map.length > 0 && missingMaps.length === 0) {
      checks.push(
        diagOk(
          "mods.maps",
          "Map= entries resolve",
          `${ini.Map.length} map layer${ini.Map.length === 1 ? "" : "s"} configured.`,
          { category: "server" },
        ),
      );
    } else if (missingMaps.length > 0) {
      const modsInMap = missingMaps.filter((m) =>
        modNamesKnownLower.has(m.toLowerCase()),
      );
      const trulyMissing = missingMaps.filter(
        (m) => !modNamesKnownLower.has(m.toLowerCase()),
      );
      const parts = [];
      if (modsInMap.length > 0) {
        parts.push(
          `${modsInMap.length} entr${modsInMap.length === 1 ? "y is a mod" : "ies are mods"}, not a map (belong only in Mods=): ${modsInMap.join(", ")}`,
        );
      }
      if (trulyMissing.length > 0) {
        parts.push(
          `${trulyMissing.length} not found in any installed mod: ${trulyMissing.join(", ")}`,
        );
      }
      const hint =
        modsInMap.length > 0 && trulyMissing.length === 0
          ? "These names are mods, not maps. Remove them from Map= — they only need to be in Mods=."
          : trulyMissing.length > 0 && modsInMap.length === 0
            ? "Players will spawn into the void. Add the matching map mod or fix the spelling in Server Config."
            : "Remove mod names from Map=, and add the matching map mod or fix spelling for the rest.";
      checks.push(
        diagFail(
          "mods.maps",
          "Map= entries do not resolve",
          `${missingMaps.length} entr${missingMaps.length === 1 ? "y" : "ies"} in Map= cannot be found. ${parts.join(". ")}.`,
          {
            category: "server",
            hint,
            meta: { missingMaps, modsInMap, trulyMissing },
          },
        ),
      );
    }
  }
}
