// Server status/info and filesystem-browsing utility routes.
import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { isValidPath, isWindows } from "./shared.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

export function registerStatusRoutes(router) {
  registerStatusRoute(router);
  registerNetworkInterfacesRoute(router);
  registerListDirectoryRoute(router);
  registerBrowseFolderRoute(router);
}

function registerStatusRoute(router) {
  // Get server status
  router.get("/status", async (req, res) => {
    try {
      const serverManager = req.app.get("serverManager");
      const rconService = req.app.get("rconService");
      log.debug("GET /status");

      const status = await serverManager.getServerStatus();
      const rconStatus = rconService.getConfig();

      res.json({
        ...status,
        rcon: rconStatus,
      });
    } catch (error) {
      log.error(`Failed to get server status: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerNetworkInterfacesRoute(router) {
  // List every non-internal IPv4 address the host currently has (one per
  // network adapter/VPN mesh) so Settings can offer a picker instead of the
  // dashboard guessing which one to show.
  router.get("/network-interfaces", async (req, res) => {
    try {
      const serverManager = req.app.get("serverManager");
      res.json({ interfaces: serverManager.listNetworkInterfaces() });
    } catch (error) {
      log.error(`Failed to list network interfaces: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerListDirectoryRoute(router) {
  // List directory contents for the in-app folder browser
  router.post("/list-directory", async (req, res) => {
    try {
      const fileAccess = new LocalFiles();
      const { dirPath } = req.body;

      // If no path provided, return available drives (Windows) or root (Linux)
      if (!dirPath) {
        if (isWindows) {
          // List available drive letters
          const drives = [];
          for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const drivePath = `${letter}:\\`;
            if (!(await fileAccess.access(drivePath, "read"))) continue;
            let label = `Local Disk (${letter}:)`;
            try {
              // Disk free-space query — OS-level, not game file access, so
              // this stays on direct fs (not part of the FileAccess interface).
              const stats = fs.statfsSync(drivePath);
              const totalGB = (
                (stats.bsize * stats.blocks) /
                1024 ** 3
              ).toFixed(1);
              const freeGB = ((stats.bsize * stats.bfree) / 1024 ** 3).toFixed(
                1,
              );
              label = `${letter}: — ${freeGB} GB free of ${totalGB} GB`;
            } catch (e) {
              log.debug(`Drive stat failed for ${letter}: ${e.message}`);
            }
            drives.push({
              name: `${letter}:`,
              path: drivePath,
              label,
              isDrive: true,
            });
          }
          return res.json({
            entries: drives,
            currentPath: null,
            parentPath: null,
          });
        } else {
          // Linux: start at root
          return res.json({
            entries: [{ name: "/", path: "/", label: "/", isDrive: true }],
            currentPath: null,
            parentPath: null,
          });
        }
      }

      // Validate the requested path
      if (!isValidPath(dirPath)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      const normalized = path.normalize(dirPath);

      if (!(await fileAccess.exists(normalized))) {
        return res.status(404).json({ error: "Path does not exist" });
      }

      const stat = await fileAccess.stat(normalized);
      if (!stat || !stat.isDirectory) {
        return res.status(400).json({ error: "Path is not a directory" });
      }

      // Read directory entries — only folders
      let items;
      try {
        items = await fileAccess.readdir(normalized, { withFileTypes: true });
      } catch (e) {
        const code = e && typeof e === "object" && "code" in e ? e.code : "UNKNOWN";
        const guidance = isWindows
          ? "Run the panel as an account that can read this folder."
          : "The panel service account needs read and execute permission on this folder and every parent folder.";
        return res.status(403).json({
          error: `Cannot read ${normalized} (${code}). ${guidance}`,
        });
      }

      const folders = [];
      for (const item of items) {
        if (!item.isDirectory) continue;
        // Skip hidden/system folders
        if (
          item.name.startsWith(".") ||
          item.name === "$RECYCLE.BIN" ||
          item.name === "System Volume Information"
        )
          continue;
        folders.push({
          name: item.name,
          path: path.join(normalized, item.name),
        });
      }

      // Sort alphabetically, case-insensitive
      folders.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

      // Parent path
      const parentPath = path.dirname(normalized);
      const hasParent = parentPath !== normalized; // at root when dirname === self

      res.json({
        entries: folders,
        currentPath: normalized,
        parentPath: hasParent ? parentPath : null,
      });
    } catch (error) {
      log.error(`List directory failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}

function registerBrowseFolderRoute(router) {
  // Open folder browser dialog (uses PowerShell on Windows, zenity/kdialog on Linux)
  router.post("/browse-folder", async (req, res) => {
    try {
      const { initialPath, description = "Select a folder" } = req.body;

      // Strict validation for description — alphanumeric, spaces, and basic punctuation only
      if (
        typeof description !== "string" ||
        description.length > 100 ||
        !/^[a-zA-Z0-9 _.\-:()]+$/.test(description)
      ) {
        return res.status(400).json({ error: "Invalid description parameter" });
      }

      if (!isWindows) {
        // Linux: try zenity, then kdialog, then return unsupported
        const safeDesc = description.replace(/'/g, "'\\''");
        const safePath =
          initialPath && isValidPath(initialPath)
            ? initialPath.replace(/'/g, "'\\''")
            : "";

        // Try zenity first (GNOME/GTK)
        const zenityCmd = `zenity --file-selection --directory --title='${safeDesc}'${safePath ? ` --filename='${safePath}/'` : ""}`;
        exec(zenityCmd, { timeout: 120000 }, (zenErr, zenOut) => {
          if (!zenErr && zenOut && zenOut.trim()) {
            return res.json({
              success: true,
              path: zenOut.trim(),
              cancelled: false,
            });
          }
          // If zenity returned exit code 1 (user cancelled), return cancelled
          if (zenErr && zenErr.code === 1) {
            return res.json({ success: false, path: null, cancelled: true });
          }
          // Try kdialog (KDE)
          const kdialogCmd = `kdialog --getexistingdirectory '${safePath || "~"}' --title '${safeDesc}'`;
          exec(kdialogCmd, { timeout: 120000 }, (kdErr, kdOut) => {
            if (!kdErr && kdOut && kdOut.trim()) {
              return res.json({
                success: true,
                path: kdOut.trim(),
                cancelled: false,
              });
            }
            if (kdErr && kdErr.code === 1) {
              return res.json({ success: false, path: null, cancelled: true });
            }
            // No GUI dialog available
            return res.status(501).json({
              error:
                "No folder browser available. Install zenity or kdialog, or enter the path manually.",
            });
          });
        });
        return;
      }

      const safePath =
        initialPath && isValidPath(initialPath)
          ? initialPath.replace(/'/g, "''")
          : "";
      const safeDesc = description.replace(/'/g, "''");

      // Simple FolderBrowserDialog — needs -STA for COM, no RootFolder restriction
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${safeDesc}'
$dialog.UseDescriptionForTitle = $true
$dialog.ShowNewFolderButton = $true
${safePath ? `if (Test-Path '${safePath}') { $dialog.SelectedPath = '${safePath}' }` : ""}
$result = $dialog.ShowDialog()
if ($result -eq 'OK') { Write-Output $dialog.SelectedPath } else { Write-Output '' }
`;

      const powershell = spawn(
        "powershell",
        ["-NoProfile", "-STA", "-Command", psScript],
        {
          windowsHide: false,
        },
      );

      let output = "";
      let errorOutput = "";

      powershell.stdout.on("data", (data) => {
        output += data.toString();
      });

      powershell.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      powershell.on("close", (code) => {
        const selectedPath = output.trim();

        if (code !== 0 || errorOutput) {
          log.warn(`Folder browser had issues: ${errorOutput}`);
        }

        res.json({
          success: !!selectedPath,
          path: selectedPath || null,
          cancelled: !selectedPath,
        });
      });

      powershell.on("error", (error) => {
        log.error(`Folder browser error: ${error.message}`);
        res.status(500).json({ error: "Failed to open folder browser" });
      });
    } catch (error) {
      log.error(`Browse folder failed: ${error.message}`);
      res.status(500).json({ error: sanitizeError(error.message) });
    }
  });
}
