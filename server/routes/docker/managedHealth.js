// Health check for a managed Docker container — diagnoses common PZ
// startup failures (missing 32-bit libs, OOM, disk full, crash-loops).
import { getServer } from "../../database/init.js";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";

const log = createLogger("API:DockerManaged");

function getDockerClient(req) {
  return req.app.get("dockerClient");
}

export function registerManagedHealthRoutes(router) {
  router.get("/servers/:id/health", async (req, res) => {
    try {
      const server = await getServer(req.params.id);
      if (!server) return res.status(404).json({ success: false, error: "Server not found" });

      const dockerClient = getDockerClient(req);
      if (!dockerClient?.available) {
        return res.status(503).json({ success: false, error: "Docker unavailable" });
      }

      const containerId = server.dockerContainerId;
      if (!containerId) return res.json({ success: false, error: "No container ID" });

      const info = await dockerClient.inspectContainer(containerId);
      if (!info) return res.json({ success: false, error: "Container not found" });

      const state = info.State || {};
      const health = buildHealthReport(state, info);

      if (containerId) {
        await attachLogDiagnostics(health, dockerClient, containerId);
      }

      health.healthy = health.running && health.issues.length === 0;
      res.json({ success: true, health });
    } catch (error) {
      log.error(`Health check failed: ${error.message}`);
      res.status(500).json({ success: false, error: sanitizeError(error.message) });
    }
  });
}

function buildHealthReport(state, info) {
  const health = {
    running: !!state.Running,
    status: state.Status,
    exitCode: state.ExitCode,
    restartCount: info.RestartCount || 0,
    startedAt: state.StartedAt,
    finishedAt: state.FinishedAt,
    issues: [],
  };

  if (!state.Running && state.ExitCode !== 0) {
    health.issues.push({
      severity: "critical",
      message: `Container exited with code ${state.ExitCode}`,
      hint: "Check container logs for errors. Common causes: missing 32-bit libraries, insufficient memory, or missing PZ server files.",
    });
  }

  if ((info.RestartCount || 0) > 3) {
    health.issues.push({
      severity: "warning",
      message: `Container has restarted ${info.RestartCount} times`,
      hint: "The server may be crash-looping. Check logs for the root cause.",
    });
  }

  return health;
}

const LOG_PATTERNS = [
  {
    test: /lib32gcc|libstdc\+\+|cannot open shared object/i,
    severity: "critical",
    message: "Missing 32-bit compatibility libraries",
    hint: "The container image needs lib32gcc-s1 and libstdc++6:i386. Recreate the server to use the updated container spec.",
  },
  {
    test: /java.*OutOfMemoryError|Cannot allocate memory/i,
    severity: "critical",
    message: "Out of memory",
    hint: "Increase the JVM memory allocation (minMemory/maxMemory) in server settings.",
  },
  {
    test: /ENOSPC|No space left on device/i,
    severity: "critical",
    message: "No disk space left",
    hint: "The Docker volume or host filesystem is full. Free disk space or move volumes to a larger drive.",
  },
];

async function attachLogDiagnostics(health, dockerClient, containerId) {
  try {
    const logResult = await dockerClient.getContainerLogs(containerId, 50);
    if (!logResult.success || !logResult.lines) return;

    const logs = logResult.lines.join("\n");
    for (const pattern of LOG_PATTERNS) {
      if (pattern.test.test(logs)) {
        health.issues.push({
          severity: pattern.severity,
          message: pattern.message,
          hint: pattern.hint,
        });
      }
    }
    health.recentLogs = logResult.lines.slice(-20);
  } catch {
    // Logs not available — not critical
  }
}
