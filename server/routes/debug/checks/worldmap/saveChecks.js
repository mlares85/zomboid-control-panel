import path from "path";
import { safePathExists, safeReaddir, safeStat } from "../../fsProbe.js";
import { diagInfo, diagOk, diagWarn } from "../../diagHelpers.js";
import { detectSaveBuild } from "./probes.js";

// Locates the active server's save folder and detects B41 vs B42 layout.
export async function checkSaveBuild(checks, activeServer) {
  // ─── Server build + active save ───────────────────────────────────
  let saveBuild = "unknown";
  let saveName = null;
  let savePath = null;
  let savesDir = null;
  let saveCount = 0;

  if (activeServer?.zomboidDataPath) {
    // PZ saves live under <zomboidData>/Saves/<gameMode>/<saveName>
    // We don't know which game mode, so just enumerate candidates.
    const savesRoot = path.join(activeServer.zomboidDataPath, "Saves");
    if (await safePathExists(savesRoot)) {
      try {
        const modes = (await safeReaddir(savesRoot)) || [];
        for (const mode of modes) {
          const modeDir = path.join(savesRoot, mode);
          const st = await safeStat(modeDir);
          if (!st || !st.isDirectory()) continue;
          const saves = (await safeReaddir(modeDir)) || [];
          for (const s of saves) {
            const sp = path.join(modeDir, s);
            const sst = await safeStat(sp);
            if (sst && sst.isDirectory()) {
              saveCount++;
              if (!savePath) {
                savePath = sp;
                saveName = s;
                savesDir = modeDir;
              }
            }
          }
        }
      } catch {
        // ignore enumeration errors
      }
    }

    if (saveCount === 0) {
      checks.push(
        diagInfo(
          "worldmap.save.none",
          "No save found yet",
          "No save folder under <zomboidData>/Saves. The server hasn't generated a world yet — the map will still render but without chunk data.",
          { category: "worldmap" },
        ),
      );
    } else {
      if (savePath) {
        saveBuild = await detectSaveBuild(savePath);
      }
      if (saveBuild === "b42") {
        checks.push(
          diagOk(
            "worldmap.save.build",
            "B42 save detected",
            `${saveCount} save(s); using ${saveName} for build detection (map/X/Y.bin layout).`,
            { category: "worldmap" },
          ),
        );
      } else if (saveBuild === "b41") {
        checks.push(
          diagOk(
            "worldmap.save.build",
            "B41 save detected",
            `${saveCount} save(s); using ${saveName} (map_X_Y.bin layout). Map will switch to B41 tile source.`,
            { category: "worldmap" },
          ),
        );
      } else {
        checks.push(
          diagWarn(
            "worldmap.save.build",
            "Save build not detected",
            `Found ${saveCount} save folder(s) but couldn\'t identify B41 vs B42 layout. Map will default to B42 origin and player coords may render off-screen on a B41 save.`,
            {
              category: "worldmap",
              hint: "Start the server once to materialise chunk files.",
            },
          ),
        );
      }
    }
  } else {
    checks.push(
      diagWarn(
        "worldmap.save.dataPath",
        "No Zomboid data path set",
        "Cannot locate save folders. Map auto-detection of B41/B42 will be skipped.",
        { category: "worldmap", hint: "Servers → Edit → Zomboid Data Path" },
      ),
    );
  }

  return { saveBuild, saveName, savePath, savesDir, saveCount };
}
