// Read-only SteamCMD info routes: auto-detect, branch listing, and
// existence check for a given path.
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { getSetting, setSetting } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { isValidPath } from "./shared.js";
import {
  getSteamCmdExe,
  findSteamCmdPath,
  parseSteamBranches,
  FALLBACK_BRANCHES,
  isWindows,
} from "./steamcmd.js";
import { registerSteamcmdDownloadRoute } from "./steamcmdDownload.js";
import { detectSetupEnvironment } from "../../services/installer/detectInstall.js";

const log = createLogger("API:Server");

export function registerSteamcmdInfoRoutes(router) {
  registerDetectRoute(router);
  registerSetupDetectRoute(router);
  registerBranchesRoute(router);
  registerCheckRoute(router);
  registerSteamcmdDownloadRoute(router);
}

function registerDetectRoute(router) {
  router.get("/steamcmd/detect", async (_req, res) => {
    try {
      const steamcmdPath = await findSteamCmdPath();
      if (!steamcmdPath) {
        return res.json({ found: false, message: "SteamCMD was not found automatically" });
      }

      const configuredPath = await getSetting("steamcmdPath");
      if (configuredPath !== steamcmdPath) {
        await setSetting("steamcmdPath", steamcmdPath);
      }

      res.json({
        found: true,
        path: steamcmdPath,
        executable: getSteamCmdExe(steamcmdPath),
        message: "SteamCMD found automatically",
      });
    } catch (error) {
      log.warn(`Failed to detect SteamCMD: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerSetupDetectRoute(router) {
  // Auto-detect SteamCMD, existing PZ installs, and suggest paths
  router.get("/setup/detect", (_req, res) => {
    try {
      res.json(detectSetupEnvironment());
    } catch (error) {
      log.warn(`Setup detection failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerBranchesRoute(router) {
  // Get available Steam branches for PZ Dedicated Server (App ID 380870)
  router.get("/branches", async (req, res) => {
    try {
      const steamcmdPath =
        req.query.steamcmdPath || (await getSetting("steamcmdPath"));
      log.info(
        `GET /branches (steamcmdPath=${steamcmdPath || "not configured"})`,
      );

      if (!steamcmdPath) {
        // Return fallback branches if no SteamCMD configured
        return res.json({
          branches: FALLBACK_BRANCHES,
          source: "fallback",
          message: "SteamCMD path not configured, using fallback branches",
        });
      }

      const steamcmdExe = getSteamCmdExe(steamcmdPath);
      if (!fs.existsSync(steamcmdExe)) {
        return res.json({
          branches: FALLBACK_BRANCHES,
          source: "fallback",
          message: "SteamCMD not found, using fallback branches",
        });
      }

      // Run SteamCMD to get app info
      const steamcmdArgs = [
        "+login",
        "anonymous",
        "+app_info_update",
        "1",
        "+app_info_print",
        "380870",
        "+quit",
      ];

      const result = await new Promise((resolve, reject) => {
        // On Linux, set LD_LIBRARY_PATH for SteamCMD's 32-bit libraries
        const branchSpawnOpts = { cwd: steamcmdPath, timeout: 60000 };
        if (!isWindows) {
          const ldPaths = [
            path.join(steamcmdPath, "linux32"),
            path.join(steamcmdPath, "linux64"),
            steamcmdPath,
            process.env.LD_LIBRARY_PATH || "",
          ]
            .filter(Boolean)
            .join(":");
          branchSpawnOpts.env = { ...process.env, LD_LIBRARY_PATH: ldPaths };
        }
        const steamcmd = spawn(steamcmdExe, steamcmdArgs, branchSpawnOpts);

        let stdout = "";
        let stderr = "";
        let completed = false;

        // Timeout after 30 seconds
        const timeoutId = setTimeout(() => {
          if (!completed) {
            completed = true;
            steamcmd.kill();
            reject(new Error("SteamCMD timed out"));
          }
        }, 30000);

        steamcmd.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        steamcmd.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        steamcmd.on("close", (code) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            resolve({ code, stdout, stderr });
          }
        });

        steamcmd.on("error", (err) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            reject(err);
          }
        });
      });

      // Parse the output to find branches
      const branches = parseSteamBranches(result.stdout);

      if (branches.length === 0) {
        return res.json({
          branches: FALLBACK_BRANCHES,
          source: "fallback",
          message: "Could not parse branches from SteamCMD output",
        });
      }

      res.json({
        branches,
        source: "steam",
        message: "Branches fetched from Steam",
      });
    } catch (error) {
      log.warn(`Failed to fetch Steam branches: ${error.message}`);
      res.json({
        branches: FALLBACK_BRANCHES,
        source: "fallback",
        message: `Error: ${sanitizeError(error.message)}`,
      });
    }
  });
}

function registerCheckRoute(router) {
  // Check if SteamCMD exists at a path
  router.get("/steamcmd/check", async (req, res) => {
    try {
      const { path: checkPath } = req.query;

      if (!checkPath || !isValidPath(checkPath)) {
        return res.json({ exists: false, message: "Invalid path" });
      }

      const steamcmdExe = getSteamCmdExe(checkPath);
      const exists = fs.existsSync(steamcmdExe);

      res.json({
        exists,
        path: checkPath,
        executable: steamcmdExe,
        message: exists
          ? "SteamCMD found"
          : "SteamCMD not found at this location",
      });
    } catch (error) {
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
