import { diagFail, diagOk, diagSkip, diagWarn } from "../diagHelpers.js";

// Core service health: server process, RCON, mod checker, scheduler, Discord bot.
export function buildCoreServiceChecks(checks, ctx) {
  const {
    activeServer,
    rconService,
    serverRunning,
    modChecker,
    scheduledTasks,
    scheduler,
    discordBot,
    settings,
  } = ctx;

  // ─── Core Services ────────────────────────────────────────────────
  try {
    const remoteRconOnly =
      !activeServer?.installPath &&
      !activeServer?.serverPath &&
      !activeServer?.zomboidDataPath &&
      Boolean(activeServer?.rconHost || rconService?.config?.host);

    if (remoteRconOnly) {
      checks.push(
        diagSkip(
          "server.process",
          "Remote server process",
          "Managed by the hosting provider; local process monitoring is unavailable. RCON controls remain available.",
          { category: "services" },
        ),
      );
    } else if (serverRunning) {
      checks.push(
        diagOk(
          "server.process",
          "Server process running",
          "Project Zomboid dedicated server is alive.",
          { category: "services" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "server.process",
          "Server process",
          "Server is stopped. Start it from the dashboard.",
          { category: "services", hint: "Dashboard → Start Server" },
        ),
      );
    }

    if (rconService?.isConnected?.()) {
      checks.push(
        diagOk(
          "rcon.connected",
          "RCON connected",
          `Connected to ${rconService.config?.host || "127.0.0.1"}:${rconService.config?.port || 27015}.`,
          { category: "services" },
        ),
      );
    } else if (!serverRunning) {
      checks.push(
        diagSkip(
          "rcon.connected",
          "RCON",
          "Server is offline — RCON will connect when it starts.",
          { category: "services" },
        ),
      );
    } else {
      checks.push(
        diagFail(
          "rcon.connected",
          "RCON disconnected",
          "Server is running but RCON is not connected. Check RCON port and password.",
          {
            category: "services",
            hint: "Settings → RCON · server.ini → RCONPassword",
          },
        ),
      );
    }

    if (modChecker?.isRunning) {
      const interval = Math.round((modChecker.checkInterval || 0) / 60000);
      checks.push(
        diagOk(
          "modChecker",
          "Mod update checker",
          `Polling Steam Workshop every ${interval || "?"} min.`,
          { category: "services" },
        ),
      );
    } else if (!modChecker?.workshopAcfPath) {
      // No workshop folder yet — checker can't run until server is installed/configured.
      // This is a normal "skipped" state, not a warning.
      checks.push(
        diagSkip(
          "modChecker",
          "Mod update checker",
          "Waiting for Steam Workshop folder — checker starts after the server install path is configured.",
          { category: "services", hint: "Settings → Server Path" },
        ),
      );
    } else {
      checks.push(
        diagWarn(
          "modChecker",
          "Mod update checker stopped",
          "Workshop polling is not running — mod updates won't be detected.",
          { category: "services" },
        ),
      );
    }

    {
      const enabledTasks = (scheduledTasks || []).filter(
        (t) => t.enabled,
      ).length;
      if (scheduler) {
        checks.push(
          diagOk(
            "scheduler",
            "Scheduler",
            `${enabledTasks} enabled task${enabledTasks === 1 ? "" : "s"}.`,
            { category: "services" },
          ),
        );
      } else {
        checks.push(
          diagWarn(
            "scheduler",
            "Scheduler unavailable",
            "Scheduler service did not initialize.",
            { category: "services" },
          ),
        );
      }
    }

    if (discordBot?.token || settings?.discordBotToken) {
      if (discordBot?.isRunning && discordBot?.client?.user) {
        checks.push(
          diagOk(
            "discord.bot",
            "Discord bot connected",
            `Logged in as ${discordBot.client.user.tag}.`,
            { category: "services" },
          ),
        );
      } else {
        checks.push(
          diagFail(
            "discord.bot",
            "Discord bot offline",
            "Bot token configured but not connected. Token may be invalid.",
            { category: "services", hint: "Settings → Discord" },
          ),
        );
      }
    } else {
      checks.push(
        diagSkip("discord.bot", "Discord bot", "Not configured (optional).", {
          category: "services",
        }),
      );
    }
  } catch (e) {
    checks.push(
      diagWarn(
        "services.error",
        "Service checks errored",
        `Some service checks could not run: ${e?.message || "unknown"}`,
        { category: "services" },
      ),
    );
  }
}
