import express from "express";
import { createLogger } from "../../utils/logger.js";
import { sanitizeError } from "../../utils/sanitize.js";
import { getServers } from "../../database/init.js";
import { testRconConnection, normalizeRconHost } from "../../services/rcon.js";

const log = createLogger("API:RconStatus");
const router = express.Router();

/** Run `mapper` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await mapper(items[i]);
    }
  }

  const count = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

function isRconConfigured(server) {
  return Boolean(server.rconHost && server.rconPort);
}

async function probeServer(server) {
  if (!isRconConfigured(server)) {
    return { id: server.id, status: "unconfigured" };
  }

  const result = await testRconConnection({
    host: normalizeRconHost(server.rconHost),
    port: server.rconPort,
    password: server.rconPassword || "",
    timeoutMs: 3000,
  });

  return {
    id: server.id,
    status: result.success ? "connected" : "unavailable",
  };
}

router.get("/rcon-status", async (_req, res) => {
  try {
    const servers = await getServers();
    const results = await mapWithConcurrency(servers, 3, probeServer);
    res.json({ servers: results });
  } catch (error) {
    log.error(`Failed to probe RCON status: ${error.message}`);
    res.status(500).json({ error: sanitizeError(error.message) });
  }
});

export default router;
