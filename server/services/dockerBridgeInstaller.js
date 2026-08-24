/**
 * PanelBridge install for Docker-managed servers: the panel container has no
 * local filesystem access to a managed container's install volume (named
 * volume, or bind mount owned by a different host path), so the local-fs
 * copy in panelBridgeInstaller.js can't reach it. Instead this uploads
 * PanelBridge.lua as a tar archive via Docker's PUT .../archive endpoint
 * (DockerClient.putArchive), which Docker extracts inside the container.
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import { create as tarCreate } from "tar";
import { resolveSourcePath } from "./panelBridgeInstaller.js";
import { createLogger } from "../utils/logger.js";
import { LocalFiles } from "./fileAccess/index.js";

const log = createLogger("DockerBridgeInstaller");

const ENTRY_PATH = "media/lua/server/PanelBridge.lua";

// Packs PanelBridge.lua into a minimal in-memory tar via a throwaway temp
// dir (the `tar` package packs from real files, not strings), rooted so
// Docker's archive API extracts it at media/lua/server/ under targetDir.
async function buildBridgeTar(luaContent) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panelbridge-tar-"));
  try {
    const luaDir = path.join(tmpRoot, "media", "lua", "server");
    await fs.mkdir(luaDir, { recursive: true });
    await fs.writeFile(path.join(luaDir, "PanelBridge.lua"), luaContent, "utf8");
    const stream = tarCreate({ cwd: tmpRoot, gzip: false, portable: true }, [ENTRY_PATH]);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

// Uploads PanelBridge.lua into a docker-managed server's container at
// {targetDir}/media/lua/server/PanelBridge.lua via `docker cp`-equivalent
// archive upload. Never throws — degrades to { success: false, error }.
export async function installBridgeToContainer(dockerClient, containerId, targetDir, { fileAccess } = {}) {
  if (!containerId) return { success: false, error: "Container id is required" };
  if (!targetDir) return { success: false, error: "Target directory is required" };

  const fa = fileAccess || new LocalFiles();
  const sourcePath = await resolveSourcePath({ fileAccess: fa });
  if (!sourcePath) {
    return { success: false, error: "PanelBridge source not found in panel install." };
  }
  const read = await fa.readFile(sourcePath, "utf8");
  if (!read.success) {
    return { success: false, error: `Could not read PanelBridge source: ${read.error}` };
  }

  let tarBuffer;
  try {
    tarBuffer = await buildBridgeTar(read.data);
  } catch (err) {
    log.warn(`Failed to build PanelBridge tar: ${err.message}`);
    return { success: false, error: err.message };
  }

  const uploadResult = await dockerClient.putArchive(containerId, targetDir, tarBuffer);
  if (!uploadResult.success) {
    log.warn(`PanelBridge upload to container ${containerId} failed: ${uploadResult.error}`);
    return { success: false, error: uploadResult.error };
  }

  log.info(`PanelBridge.lua uploaded to container ${containerId} at ${targetDir}`);
  return { success: true };
}
