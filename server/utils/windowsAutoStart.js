// Windows auto-start via Task Scheduler.
// Creates/removes a scheduled task that launches the panel (via Start.bat
// if present, otherwise the exe directly) at user logon.
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { createLogger } from "./logger.js";

const execAsync = promisify(exec);
const log = createLogger("WindowsAutoStart");

const TASK_NAME = "ZomboidControlPanel";
const isWindows = process.platform === "win32";

/** Resolve the launch target: Start.bat if it exists, otherwise the exe. */
function getLaunchTarget() {
  const exePath = process.execPath;
  const exeDir = path.dirname(exePath);
  const batPath = path.join(exeDir, "Start.bat");
  if (fs.existsSync(batPath)) return { path: batPath, isScript: true };
  return { path: exePath, isScript: false };
}

/**
 * Check whether the auto-start task exists in Task Scheduler.
 * @returns {{ enabled: boolean, supported: boolean, taskPath?: string }}
 */
export async function getAutoStartStatus() {
  if (!isWindows) return { enabled: false, supported: false };

  try {
    const { stdout } = await execAsync(
      `schtasks /Query /TN "${TASK_NAME}" /FO CSV /NH`,
      { timeout: 5000 },
    );
    const enabled = stdout.includes(TASK_NAME);
    return { enabled, supported: true };
  } catch {
    // Task doesn't exist — that's the "disabled" state, not an error
    return { enabled: false, supported: true };
  }
}

/**
 * Create a Task Scheduler entry that runs the panel at user logon.
 * @returns {{ success: boolean, error?: string }}
 */
export async function enableAutoStart() {
  if (!isWindows) return { success: false, error: "Only supported on Windows" };

  const target = getLaunchTarget();
  log.info(`Enabling auto-start: ${target.path}`);

  try {
    // Remove existing task first (idempotent)
    await execAsync(`schtasks /Delete /TN "${TASK_NAME}" /F`, {
      timeout: 5000,
    }).catch(() => {});

    // schtasks /Create with ONLOGON trigger. /RL LIMITED = normal user
    // privileges (not elevated). /DELAY adds a 10-second delay so the
    // desktop is ready before a console window appears.
    const cmd = [
      "schtasks /Create",
      `/TN "${TASK_NAME}"`,
      `/TR "\\"${target.path}\\""`,
      "/SC ONLOGON",
      "/RL LIMITED",
      "/DELAY 0000:10",
      "/F",
    ].join(" ");

    await execAsync(cmd, { timeout: 10000 });
    log.info("Auto-start task created successfully");
    return { success: true };
  } catch (err) {
    log.error(`Failed to create auto-start task: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Remove the Task Scheduler entry.
 * @returns {{ success: boolean, error?: string }}
 */
export async function disableAutoStart() {
  if (!isWindows) return { success: false, error: "Only supported on Windows" };

  log.info("Disabling auto-start");

  try {
    await execAsync(`schtasks /Delete /TN "${TASK_NAME}" /F`, {
      timeout: 5000,
    });
    log.info("Auto-start task removed");
    return { success: true };
  } catch (err) {
    // "The system cannot find the file specified" = already removed
    if (err.message.includes("cannot find")) {
      return { success: true };
    }
    log.error(`Failed to remove auto-start task: ${err.message}`);
    return { success: false, error: err.message };
  }
}
