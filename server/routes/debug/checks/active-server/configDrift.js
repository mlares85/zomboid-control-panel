import { diagFail, diagOk } from "../../diagHelpers.js";

// Flags drift between panel-managed server settings (RCON port/password,
// game port) and the ground-truth values in server.ini.
export function checkConfigDrift(checks, activeServer, ini) {
  // Config drift — panel settings vs server.ini ground truth.
  if (ini) {
    const drift = [];
    const panelRconPort = parseInt(activeServer.rconPort, 10);
    if (
      Number.isFinite(panelRconPort) &&
      ini.RCONPort &&
      panelRconPort !== ini.RCONPort
    ) {
      drift.push(
        `RCON port: panel ${panelRconPort} vs ini ${ini.RCONPort}`,
      );
    }
    if (
      activeServer.rconPassword &&
      ini.RCONPassword &&
      activeServer.rconPassword !== ini.RCONPassword
    ) {
      drift.push("RCON password differs from server.ini");
    }
    const panelGamePort = parseInt(
      activeServer.gamePort || activeServer.port,
      10,
    );
    if (
      Number.isFinite(panelGamePort) &&
      ini.DefaultPort &&
      panelGamePort !== ini.DefaultPort
    ) {
      drift.push(
        `Game port: panel ${panelGamePort} vs ini DefaultPort ${ini.DefaultPort}`,
      );
    }
    if (drift.length > 0) {
      checks.push(
        diagFail(
          "server.configDrift",
          "Panel config differs from server.ini",
          drift.join("; ") + ".",
          {
            category: "server",
            hint: "Edit Servers → Edit to match server.ini, or update server.ini via Server Config.",
            meta: { drift },
          },
        ),
      );
    } else {
      checks.push(
        diagOk(
          "server.configDrift",
          "Panel config matches server.ini",
          "RCON port, password, and game port agree with server.ini.",
          { category: "server" },
        ),
      );
    }
  }
}
