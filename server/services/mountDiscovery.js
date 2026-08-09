// Cheap filesystem probes for an already-present Project Zomboid server —
// used by the first-run onboarding wizard so it can offer "connect to the
// server we found" instead of asking the user to type paths blind.
//
// Reuses the signature checks zomboidPaths.js already has for the manual
// "detect from this path" flow; this just widens the candidate list to
// common container bind-mount points (ich777/steamcmd, linuxserver, Unraid
// appdata layouts) that a host-account-based search would never find.
import fs from "fs";
import path from "path";
import {
  getCandidateZomboidPaths,
  inspectZomboidPath,
} from "../utils/zomboidPaths.js";

const CONTAINER_MOUNT_CANDIDATES = [
  "/pz-server",
  "/server",
  "/serverfiles",
  "/data",
  "/config",
  "/home/steam/pz-dedicated/Zomboid",
];

function envPathCandidates() {
  return [process.env.PZ_SERVER_PATH, process.env.PZ_SAVE_PATH].filter(
    Boolean,
  );
}

// Does `dir` look like a PZ data folder or a PZ install folder? Returns
// null when it's neither (missing, unreadable, or no recognizable markers).
export function probeMount(dir) {
  if (!dir) return null;
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const verdict = inspectZomboidPath(dir);
  if (verdict.ok) {
    return {
      path: dir,
      type: "data",
      hasSavesDir: Boolean(
        verdict.checks.hasSavesDir || verdict.checks.hasMultiplayerDir,
      ),
    };
  }
  if (verdict.reason === "install-folder") {
    return { path: dir, type: "install" };
  }
  return null;
}

// Scan env-configured paths, common container bind-mount points, and the
// OS-account candidates zomboidPaths.js already knows about. All checks are
// existsSync-cheap, so this is safe to call on every environment snapshot
// request during onboarding.
export function discoverMounts() {
  const candidates = [
    ...envPathCandidates(),
    ...CONTAINER_MOUNT_CANDIDATES,
    ...getCandidateZomboidPaths().map((c) => c.path),
  ];

  const seen = new Set();
  const results = [];
  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const found = probeMount(resolved);
    if (found) results.push(found);
  }
  return results;
}
