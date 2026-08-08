import fs from "fs";
import path from "path";
import { escapeRegExp } from "../../utils/regex.js";
import { withFileLock, writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { getActiveServer } from "../../database/init.js";
import { sanitizeError } from "../../utils/sanitize.js";
import {
  acquireMirrorLock,
  beginRemoteConfigSession,
  pushRemoteConfigFiles,
} from "../../services/remoteConfigFiles.js";
import {
  resolveRemoteConfigTransport,
  getServerConfigPath,
  getServerName,
  createBackup,
} from "./context.js";
import { modifySandboxValue } from "./sandboxParse.js";

// Write top-level sandbox keys straight to disk. The in-game bridge can only
// change SandboxOptions in memory, so without this every change is lost on the
// next server start.
export async function persistSandboxValues(values) {
  const entries = Object.entries(values || {});
  if (entries.length === 0) return { persisted: false, reason: "nothing to do" };

  const activeServer = await getActiveServer();
  // Called from the PanelBridge routes, outside the mirror middleware, so a
  // remote server has to pull and push around its own write.
  if (activeServer?.isRemote) {
    const transport = await resolveRemoteConfigTransport();
    if (!transport) {
      return { persisted: false, reason: "remote server filesystem" };
    }
    const serverName = await getServerName();
    const release = await acquireMirrorLock();
    try {
      const session = await beginRemoteConfigSession(transport, serverName, {
        fresh: true,
      });
      const result = await writeSandboxValues(entries, session.mirrorDir, serverName);
      if (result.persisted) {
        await pushRemoteConfigFiles(transport, serverName, session);
      }
      return result;
    } catch (err) {
      return { persisted: false, reason: sanitizeError(err.message) };
    } finally {
      release();
    }
  }

  return writeSandboxValues(
    entries,
    await getServerConfigPath(),
    await getServerName(),
  );
}

async function writeSandboxValues(entries, configPath, serverName) {
  const filePath = path.join(configPath, `${serverName}_SandboxVars.lua`);
  if (!fs.existsSync(filePath)) {
    return { persisted: false, reason: "SandboxVars.lua not found" };
  }

  let persisted = false;
  let reason = null;
  await withFileLock(filePath, async () => {
    const originalContent = fs.readFileSync(filePath, "utf-8");
    let content = originalContent;

    // modifySandboxValue only rewrites existing assignments, so a key that
    // isn't in the file would no-op and look like "already correct".
    const missing = entries
      .map(([key]) => key)
      .filter(
        (key) => !new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "m").test(content),
      );
    if (missing.length > 0) {
      reason = `not present in SandboxVars.lua: ${missing.join(", ")}`;
      return;
    }

    for (const [key, value] of entries) {
      content = modifySandboxValue(content, key, value, null);
    }
    if (content === originalContent) {
      reason = "values already match";
      return;
    }
    await createBackup(`${serverName}_SandboxVars.lua`);
    writeFileAtomic(filePath, content, "utf-8");
    persisted = true;
  });

  return { persisted, reason };
}
