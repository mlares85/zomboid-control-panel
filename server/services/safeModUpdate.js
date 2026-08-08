import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { getDataPaths } from "../utils/paths.js";

const log = createLogger("SafeModUpdate");

// Mirrors the 5-step list the UI shows: Backup -> Update Mods -> Warning
// Players -> Restart -> Verify. "Update Mods" has no separate download call —
// the PZ dedicated server validates/re-downloads Workshop content itself as
// part of booting (unless -nosteam), so applying updates IS the restart.
// This step exists to surface what's pending before that restart happens.
export const SAFE_UPDATE_STEPS = [
  "backup",
  "update",
  "warning",
  "restart",
  "verify",
];

const DEFAULT_WARNING_SECONDS = 30;
const MAX_WARNING_SECONDS = 600;
const RCON_WAIT_ATTEMPTS = 10;
const RCON_WAIT_DELAY_MS = 15000;
const STOP_POLL_ATTEMPTS = 60;
const STOP_POLL_DELAY_MS = 1000;
// Common Java/PZ crash signatures — a loose net, not exhaustive. Verify only
// downgrades an otherwise-successful restart to a warning, never blocks it.
const ERROR_LOG_PATTERN =
  /(Exception in thread|OutOfMemoryError|FATAL ERROR|Could not find or load main class)/i;

let inProgress = false;

export function isSafeUpdateInProgress() {
  return inProgress;
}

export function clampWarningSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_WARNING_SECONDS;
  return Math.min(Math.round(n), MAX_WARNING_SECONDS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitStep(io, step, status, detail) {
  if (io) io.emit("modUpdate:step", { step, status, detail: detail || null });
  log.info(`[${step}] ${status}${detail ? ` — ${detail}` : ""}`);
}

async function validatePreconditions(serverManager, rconService) {
  const running = await serverManager.checkServerRunning();
  if (!running) return { ok: false, message: "Server is not running" };
  if (!rconService.connected) return { ok: false, message: "RCON is not connected" };
  return { ok: true };
}

// Runs an RCON command, swallowing failures — a failed save/quit/broadcast
// should not abort the sequence, it just gets logged and the caller moves on
// (the following restart steps re-verify server state independently).
async function safeCall(fn, label) {
  try {
    const result = await fn();
    if (result && result.success === false) {
      log.warn(`Safe update: ${label} reported failure: ${result.error || result.message}`);
    }
    return result;
  } catch (error) {
    log.warn(`Safe update: ${label} threw: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function waitForServerStop(serverManager) {
  for (let i = 0; i < STOP_POLL_ATTEMPTS; i++) {
    if (!(await serverManager.checkServerRunning())) return true;
    await sleep(STOP_POLL_DELAY_MS);
  }
  return false;
}

async function ensureServerStopped(serverManager) {
  if (await waitForServerStop(serverManager)) return;
  const forced = await serverManager.stopServer(false);
  if (!forced?.success || (await serverManager.checkServerRunning())) {
    throw new Error(forced?.message || "Server did not stop after the quit command");
  }
}

async function waitForRconReconnect(rconService) {
  if (rconService.connected) return true;
  for (let i = 0; i < RCON_WAIT_ATTEMPTS; i++) {
    await sleep(RCON_WAIT_DELAY_MS);
    if (rconService.connected) return true;
    try {
      await rconService.connect();
    } catch (error) {
      log.debug(`Safe update: RCON reconnect attempt failed: ${error.message}`);
    }
    if (rconService.connected) return true;
  }
  return false;
}

function findLaunchLogErrors() {
  try {
    const logPath = path.join(getDataPaths().logsDir, "server-launch.log");
    if (!fs.existsSync(logPath)) return null;
    const tail = fs.readFileSync(logPath, "utf-8").slice(-4000);
    const match = tail.match(ERROR_LOG_PATTERN);
    return match ? match[0] : null;
  } catch (error) {
    log.debug(`findLaunchLogErrors: could not read launch log: ${error.message}`);
    return null;
  }
}

async function runBackupStep(ctx) {
  const { backupService, io } = ctx;
  emitStep(io, "backup", "in_progress", "Creating backup...");
  const result = await backupService.createBackup({ io });
  if (!result.success) {
    emitStep(io, "backup", "failed", result.message || "Backup failed");
    return { success: false, step: "backup", message: result.message || "Backup failed" };
  }
  emitStep(io, "backup", "success", `Backup created (${result.backup?.name || "ok"})`);
  return { success: true };
}

async function runUpdateStep(ctx) {
  const { modChecker, io } = ctx;
  emitStep(io, "update", "in_progress", "Checking for mod updates...");
  try {
    const result = await modChecker.checkForUpdates();
    const mods = result?.mods || [];
    const detail = mods.length
      ? `${mods.length} mod(s) will update on restart: ${mods.map((m) => m.name).join(", ").slice(0, 200)}`
      : "No pending mod updates detected — the restart will still refresh Workshop content";
    ctx.mods = mods;
    emitStep(io, "update", "success", detail);
  } catch (error) {
    // Non-fatal — Steam still validates/updates mods as part of server boot.
    ctx.mods = [];
    emitStep(io, "update", "success", `Could not confirm pending updates (${error.message}) — continuing`);
  }
  return { success: true };
}

async function runWarningStep(ctx) {
  const { rconService, io, warningSeconds, mods } = ctx;
  emitStep(io, "warning", "in_progress", `Warning players — restarting in ${warningSeconds}s`);
  const names = (mods || []).map((m) => m.name).slice(0, 5).join(", ");
  const message = `Server restarting in ${warningSeconds}s for mod updates${names ? ` (${names})` : ""}`;
  await safeCall(() => rconService.serverMessage(message), "warning broadcast");
  await sleep(warningSeconds * 1000);
  emitStep(io, "warning", "success", "Players warned");
  return { success: true };
}

async function runRestartStep(ctx) {
  const { rconService, serverManager, io } = ctx;
  try {
    emitStep(io, "restart", "in_progress", "Saving world...");
    await safeCall(() => rconService.save(), "save");

    emitStep(io, "restart", "in_progress", "Sending quit command...");
    await safeCall(() => rconService.quit(), "quit");

    emitStep(io, "restart", "in_progress", "Waiting for server to stop...");
    await ensureServerStopped(serverManager);

    rconService.setServerStarting?.(true);
    emitStep(io, "restart", "in_progress", "Starting server...");
    const started = await serverManager.startServer({ skipRunningCheck: true });
    if (started?.success === false) {
      throw new Error(started.message || "Failed to start server");
    }

    emitStep(io, "restart", "in_progress", "Waiting for server to come back online...");
    ctx.rconConnected = await waitForRconReconnect(rconService);

    const detail = ctx.rconConnected
      ? "Server restarted and RCON reconnected"
      : "Server restarted (RCON has not reconnected yet)";
    emitStep(io, "restart", "success", detail);
    return { success: true };
  } catch (error) {
    emitStep(io, "restart", "failed", error.message);
    return { success: false, step: "restart", message: error.message };
  } finally {
    rconService.setServerStarting?.(false);
  }
}

async function runVerifyStep(ctx) {
  const { serverManager, io } = ctx;
  emitStep(io, "verify", "in_progress", "Verifying server boot...");
  const running = await serverManager.checkServerRunning();
  if (!running) {
    emitStep(io, "verify", "failed", "Server process is not running after restart");
    return { success: false, step: "verify", message: "Server process is not running after restart" };
  }
  const logIssue = findLaunchLogErrors();
  if (logIssue) {
    emitStep(io, "verify", "failed", `Server started but the launch log shows errors: ${logIssue}`);
    return { success: false, step: "verify", message: logIssue };
  }
  const detail = ctx.rconConnected
    ? "Server is back online"
    : "Server process is running but RCON has not reconnected yet";
  emitStep(io, "verify", "success", detail);
  return { success: true };
}

async function runSteps(ctx) {
  const backup = await runBackupStep(ctx);
  if (!backup.success) return backup;

  await runUpdateStep(ctx);
  await runWarningStep(ctx);

  const restart = await runRestartStep(ctx);
  if (!restart.success) return restart;

  return runVerifyStep(ctx);
}

/**
 * Composes the existing backup / mod-check / RCON / server-manager services
 * into the "safe mod update" sequence: backup -> check updates -> warn
 * players -> save+quit+wait+start+wait-for-rcon -> verify boot. Each phase
 * emits `modUpdate:step` events on `io` so the frontend can render progress.
 */
export async function runSafeModUpdate({
  modChecker,
  backupService,
  serverManager,
  rconService,
  io,
  warningSeconds = DEFAULT_WARNING_SECONDS,
}) {
  if (inProgress) {
    return { success: false, message: "A safe update is already in progress" };
  }

  const validation = await validatePreconditions(serverManager, rconService);
  if (!validation.ok) {
    return { success: false, message: validation.message };
  }

  inProgress = true;
  const ctx = {
    modChecker,
    backupService,
    serverManager,
    rconService,
    io,
    warningSeconds: clampWarningSeconds(warningSeconds),
  };
  try {
    return await runSteps(ctx);
  } catch (error) {
    log.error(`Safe mod update failed unexpectedly: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    inProgress = false;
  }
}
