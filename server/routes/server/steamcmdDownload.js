// Auto-download and install SteamCMD itself (distinct from installing the PZ
// game server via SteamCMD — see install.js).
import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import https from "https";
import os from "os";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { isValidPath } from "./shared.js";
import { getSteamCmdExe, isWindows } from "./steamcmd.js";
import unzipper from "unzipper";

const log = createLogger("API:Server");

export function registerSteamcmdDownloadRoute(router) {
  router.post("/steamcmd/download", async (req, res) => {
    try {
      log.info(`POST /steamcmd/download (platform=${process.platform})`);
      const defaultPath = isWindows
        ? "C:\\SteamCMD"
        : [
            "/usr/games",
            "/usr/bin",
            path.join(os.homedir(), "steamcmd"),
            "/opt/steamcmd",
            "/usr/local/bin",
          ].find(
            (p) =>
              fs.existsSync(path.join(p, "steamcmd.sh")) ||
              fs.existsSync(path.join(p, "steamcmd")),
          ) || path.join(os.homedir(), "steamcmd");
      const { installPath = defaultPath } = req.body;

      if (!isValidPath(installPath)) {
        return res.status(400).json({ error: "Invalid installation path" });
      }

      const io = req.app.get("io");

      // Create directory if it doesn't exist
      if (!fs.existsSync(installPath)) {
        fs.mkdirSync(installPath, { recursive: true });
      }

      if (isWindows) {
        await downloadForWindows(installPath, io);
      } else {
        downloadForLinux(installPath, io);
      }

      res.json({ success: true, message: "SteamCMD download started" });
    } catch (error) {
      log.error(`SteamCMD download failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

async function downloadForWindows(installPath, io) {
  // Windows: Download and extract zip
  const steamcmdUrl =
    "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
  const zipPath = path.join(installPath, "steamcmd.zip");

  io.emit("steamcmd:status", {
    status: "downloading",
    message: "Downloading SteamCMD...",
  });
  log.info(`Downloading SteamCMD to ${installPath}`);

  const file = fs.createWriteStream(zipPath);

  const handleDownloadError = (err) => {
    file.close();
    fs.unlink(zipPath, () => {});
    io.emit("steamcmd:status", {
      status: "error",
      message: `Download failed: ${err.message}`,
    });
    log.error(`SteamCMD download failed: ${err.message}`);
  };

  const extractAndSetup = async (zipFile) => {
    try {
      io.emit("steamcmd:status", {
        status: "extracting",
        message: "Extracting SteamCMD...",
      });
      log.info("Extracting SteamCMD...");

      await fs
        .createReadStream(zipFile)
        .pipe(unzipper.Extract({ path: installPath }))
        .promise();

      fs.unlinkSync(zipFile);
      runFirstTimeSetup(installPath, io);
    } catch (extractError) {
      io.emit("steamcmd:status", {
        status: "error",
        message: `Extraction failed: ${sanitizeError(extractError.message)}`,
      });
      log.error(`SteamCMD extraction failed: ${extractError.message}`);
    }
  };

  const downloadAndExtract = (url) => {
    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadAndExtract(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          handleDownloadError(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("close", async () => {
          await extractAndSetup(zipPath);
        });
      })
      .on("error", handleDownloadError);
  };

  downloadAndExtract(steamcmdUrl);
}

function downloadForLinux(installPath, io) {
  // Linux: Download and extract tar.gz, then make executable
  const tarUrl =
    "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";
  const tarPath = path.join(installPath, "steamcmd_linux.tar.gz");

  io.emit("steamcmd:status", {
    status: "downloading",
    message: "Downloading SteamCMD for Linux...",
  });
  log.info(`Downloading SteamCMD (Linux) to ${installPath}`);

  // Try curl first, fall back to wget (CentOS minimal may lack curl)
  const safeTarPath = tarPath.replace(/'/g, "'\\''");
  const safeTarUrl = tarUrl.replace(/'/g, "'\\''");
  const curlCmd = `curl -sSL -o '${safeTarPath}' '${safeTarUrl}'`;
  const wgetCmd = `wget -q -O '${safeTarPath}' '${safeTarUrl}'`;

  const tryDownload = (cmd, fallbackCmd) => {
    exec(cmd, { timeout: 120000 }, (dlErr) => {
      if (dlErr && fallbackCmd) {
        log.warn(
          `Download with ${cmd.split(" ")[0]} failed, trying fallback...`,
        );
        tryDownload(fallbackCmd, null);
        return;
      }
      if (dlErr) {
        io.emit("steamcmd:status", {
          status: "error",
          message: `Download failed: ${dlErr.message}. Ensure curl or wget is installed.`,
        });
        log.error(`SteamCMD download failed: ${dlErr.message}`);
        return;
      }
      afterLinuxDownload(installPath, tarPath, safeTarPath, io);
    });
  };

  tryDownload(curlCmd, wgetCmd);
}

function afterLinuxDownload(installPath, tarPath, safeTarPath, io) {
  io.emit("steamcmd:status", {
    status: "extracting",
    message: "Extracting SteamCMD...",
  });
  log.info("Extracting SteamCMD...");

  const safeInstallPath = installPath.replace(/'/g, "'\\''");
  exec(
    `tar -xzf '${safeTarPath}' -C '${safeInstallPath}'`,
    { timeout: 30000 },
    (tarErr) => {
      // Clean up tar file regardless
      try {
        fs.unlinkSync(tarPath);
      } catch (e) {
        /* ignore */
      }

      if (tarErr) {
        io.emit("steamcmd:status", {
          status: "error",
          message: `Extraction failed: ${tarErr.message}`,
        });
        log.error(`SteamCMD extraction failed: ${tarErr.message}`);
        return;
      }

      // Make steamcmd.sh executable
      const steamcmdSh = path.join(installPath, "steamcmd.sh");
      try {
        fs.chmodSync(steamcmdSh, 0o755);
      } catch (e) {
        /* ignore */
      }
      // Also make the actual binary executable
      const steamcmdBin = path.join(installPath, "steamcmd");
      try {
        fs.chmodSync(steamcmdBin, 0o755);
      } catch (e) {
        /* ignore */
      }

      // Install 32-bit libraries if missing (SteamCMD requires them on 64-bit CentOS/RHEL)
      log.info(
        "Checking for required 32-bit libraries (SteamCMD dependency)...",
      );
      exec("ldconfig -p | grep -c libc.so.6", { timeout: 5000 }, (ldErr) => {
        if (ldErr) {
          log.warn(
            "Could not verify 32-bit libraries. SteamCMD may fail if glibc.i686 / lib32gcc is not installed.",
          );
          io.emit("steamcmd:log", {
            type: "stderr",
            text: "Warning: Could not verify 32-bit libraries. If SteamCMD fails, install: yum install glibc.i686 libstdc++.i686 (CentOS/RHEL) or apt install lib32gcc-s1 (Debian/Ubuntu)",
          });
        }
        runFirstTimeSetup(installPath, io);
      });
    },
  );
}

function runFirstTimeSetup(installPath, io) {
  io.emit("steamcmd:status", {
    status: "initializing",
    message: "Initializing SteamCMD (first run)...",
  });
  log.info("Running SteamCMD first-time setup...");

  const steamcmdExe = getSteamCmdExe(installPath);
  // On Linux, set LD_LIBRARY_PATH for SteamCMD's 32-bit libraries
  const firstRunOpts = { cwd: installPath };
  if (!isWindows) {
    const ldPaths = [
      path.join(installPath, "linux32"),
      path.join(installPath, "linux64"),
      installPath,
      process.env.LD_LIBRARY_PATH || "",
    ]
      .filter(Boolean)
      .join(":");
    firstRunOpts.env = { ...process.env, LD_LIBRARY_PATH: ldPaths };
  }
  const steamcmd = spawn(steamcmdExe, ["+quit"], firstRunOpts);

  steamcmd.stdout.on("data", (data) => {
    io.emit("steamcmd:log", { type: "stdout", text: data.toString() });
  });

  steamcmd.stderr.on("data", (data) => {
    io.emit("steamcmd:log", { type: "stderr", text: data.toString() });
  });

  steamcmd.on("close", (code) => {
    if (code === 0 || code === 7) {
      io.emit("steamcmd:status", {
        status: "complete",
        message: "SteamCMD installed successfully!",
        path: installPath,
      });
      log.info(`SteamCMD installed successfully to ${installPath}`);
    } else {
      io.emit("steamcmd:status", {
        status: "error",
        message: `SteamCMD setup failed with code ${code}`,
      });
      log.error(`SteamCMD first-run failed with code ${code}`);
    }
  });

  steamcmd.on("error", (error) => {
    io.emit("steamcmd:status", {
      status: "error",
      message: `Failed to run SteamCMD: ${sanitizeError(error.message)}`,
    });
    log.error(`SteamCMD run error: ${error.message}`);
  });
}
