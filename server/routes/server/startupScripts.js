// Generates the platform-specific PZ dedicated-server startup scripts and
// writes them to disk. Shared by install.js, quickSetup.js and lifecycle.js
// (which regenerates the scripts before every /start so config changes take
// effect).
import path from "path";
import { createLogger } from "../../utils/logger.js";
import { writeFileAtomic } from "../../utils/fileWriteQueue.js";
import { normalizeMemoryGb } from "../../utils/memory.js";
import { sanitizeForBatch } from "./shared.js";
import { LocalFiles } from "../../services/fileAccess/index.js";

const log = createLogger("API:Server");

// Build the Java classpath entries for launching the dedicated server.
// PZ's required classpath varies significantly by build/version — Build 41
// needs ~15 separate library jars listed individually under java/ (guava,
// lwjgl, javacord, sqlite-jdbc, etc.), while Build 42's shaded jar only
// needs projectzomboid.jar. Hardcoding either list breaks the other build
// with a NoClassDefFoundError (see GitHub issue #14). Instead, scan the
// java/ folder that SteamCMD actually downloaded and include every jar
// present, so the classpath always matches the installed build.
export async function buildClasspathEntries(installPath) {
  const fileAccess = new LocalFiles();
  const entries = ["java/."];
  try {
    const javaDir = path.join(installPath, "java");
    if (await fileAccess.exists(javaDir)) {
      const jars = (await fileAccess.readdir(javaDir))
        .filter((f) => f.toLowerCase().endsWith(".jar"))
        .sort();
      for (const jar of jars) {
        entries.push(`java/${jar}`);
      }
    }
  } catch (e) {
    log.warn(`Could not enumerate java/ jars for classpath: ${e.message}`);
  }
  // Fallback if the java/ folder wasn't found/readable (e.g. install not
  // finished yet) — matches the previous hardcoded behavior.
  if (entries.length === 1) {
    entries.push("java/projectzomboid.jar");
  }
  return entries;
}

// Generate a custom startup script with configured options
// Returns { bat: string, sh: string } with both Windows and Linux scripts
export async function generateStartupScripts(options) {
  const {
    installPath,
    serverName,
    minMemory = 4,
    maxMemory = 8,
    zomboidDataPath,
    adminPassword,
    serverPort = 16261,
    useNoSteam = false,
    useDebug = false,
  } = options;

  // Sanitize inputs
  const safeServerName = sanitizeForBatch(serverName);
  const safeAdminPassword = adminPassword
    ? sanitizeForBatch(adminPassword)
    : "";
  const safeZomboidDataPath = zomboidDataPath
    ? sanitizeForBatch(zomboidDataPath)
    : "";
  const normalizedMinMemory = normalizeMemoryGb(minMemory, 4);
  const normalizedMaxMemory = normalizeMemoryGb(maxMemory, 8);

  // ZGC grows the heap to -Xmx and is in no hurry to give it back, so a
  // generous max quietly turns into the resident set. SoftMaxHeapSize is the
  // pressure valve: GC aims to stay under it and only spends the rest of -Xmx
  // on real spikes, which keeps PZ from crowding out everything else on the
  // host. 60% of max leaves a wide burst margin.
  const softMaxMemory = Math.max(1, Math.round(normalizedMaxMemory * 0.6));

  // Build JVM arguments (shared between both platforms)
  // IgnoreUnrecognizedVMOptions first: the Linux script falls back to a system
  // JVM when jre64/ is missing, and the newer flags below are fatal on older
  // JVMs unless they're allowed to no-op.
  const jvmArgs = [
    "-XX:+IgnoreUnrecognizedVMOptions",
    "-Djava.awt.headless=true",
    useNoSteam ? "-Dzomboid.steam=0" : "-Dzomboid.steam=1",
    "-Dzomboid.znetlog=1",
    "-XX:+UseZGC",
    `-XX:SoftMaxHeapSize=${softMaxMemory}g`,
    // Return freed heap to the OS in 2 minutes instead of the 5-minute default.
    "-XX:ZUncommitDelay=120",
    // JDK 25+: 8-byte object headers. PZ's heap is millions of small objects
    // (grid squares, tile properties, items), so this is a real footprint win.
    "-XX:+UseCompactObjectHeaders",
    // Scripts/tiles/item names load a lot of duplicate strings.
    "-XX:+UseStringDeduplication",
    "-XX:-CreateCoredumpOnCrash",
    "-XX:-OmitStackTraceInFastThrow",
    `-Xms${normalizedMinMemory}g`,
    `-Xmx${normalizedMaxMemory}g`,
  ];

  if (useDebug) {
    jvmArgs.push("-Ddebug");
  }

  // Linux-only additions. THP cuts TLB misses on ZGC's large heap; it needs the
  // host's transparent_hugepage set to "madvise" or "always" to do anything, and
  // just logs a notice otherwise. urandom keeps startup from blocking on entropy.
  const linuxJvmArgs = [
    ...jvmArgs,
    "-XX:+UseTransparentHugePages",
    "-Djava.security.egd=file:/dev/urandom",
  ];

  // Build game arguments (shared)
  const gameArgs = [`-servername "${safeServerName}"`];

  if (safeZomboidDataPath) {
    gameArgs.push(`-cachedir="${safeZomboidDataPath}"`);
  }

  if (safeAdminPassword) {
    gameArgs.push(`-adminpassword "${safeAdminPassword}"`);
  }

  if (serverPort !== 16261) {
    gameArgs.push(`-port ${serverPort}`);
  }

  if (useNoSteam) {
    gameArgs.push("-nosteam");
  }

  const classpathEntries = await buildClasspathEntries(installPath);

  // Windows batch file
  const batchContent = `@echo off
@setlocal enableextensions
@cd /d "%~dp0"

REM =====================================================
REM Project Zomboid Server Startup Script
REM Generated by PZ Server Manager
REM Server Name: ${safeServerName}
REM Memory: ${normalizedMinMemory}GB - ${normalizedMaxMemory}GB
REM =====================================================

SET PZ_CLASSPATH=${classpathEntries.join(";")}

".\\jre64\\bin\\java.exe" ${jvmArgs.join(" ")} -Djava.library.path=natives/;natives/win64/;. -cp %PZ_CLASSPATH% zombie.network.GameServer ${gameArgs.join(" ")}

PAUSE
`;

  // Linux shell script
  const shellContent = `#!/bin/bash
cd "\$(dirname "\$0")"

# =====================================================
# Project Zomboid Server Startup Script
# Generated by PZ Server Manager
# Server Name: ${safeServerName}
# Memory: ${normalizedMinMemory}GB - ${normalizedMaxMemory}GB
# =====================================================

PZ_CLASSPATH="${classpathEntries.join(":")}"

JAVA_CMD="./jre64/bin/java"
if [ ! -f "$JAVA_CMD" ]; then
  # Try common system Java locations (CentOS, Ubuntu, etc.)
  for JPATH in /usr/bin/java /usr/local/bin/java /usr/lib/jvm/jre/bin/java; do
    if [ -f "$JPATH" ]; then
      JAVA_CMD="$JPATH"
      break
    fi
  done
  if [ ! -f "$JAVA_CMD" ]; then
    JAVA_CMD="java"
  fi
fi

# Verify Java is actually available
if ! command -v "$JAVA_CMD" >/dev/null 2>&1; then
  echo "ERROR: Java not found. Install OpenJDK: sudo yum install java-17-openjdk (CentOS) or sudo apt install openjdk-17-jre (Ubuntu)"
  exit 1
fi

INSTDIR="$(dirname "$0")"
export LD_LIBRARY_PATH="\${INSTDIR}/natives/:\${INSTDIR}/natives/linux64/:\${INSTDIR}/linux64/:\${INSTDIR}:\${INSTDIR}/jre64/lib/amd64:\${INSTDIR}/jre64/lib/x86_64:/usr/lib64:\${LD_LIBRARY_PATH}"

"$JAVA_CMD" ${linuxJvmArgs.join(" ")} -Djava.library.path=natives/:natives/linux64/:linux64/:. -cp "$PZ_CLASSPATH" zombie.network.GameServer ${gameArgs.join(" ")}
`;

  return { bat: batchContent, sh: shellContent };
}

// Regenerates a server's launch script(s) from its current DB config so any
// settings changed since the scripts were last written (admin password,
// memory, port, etc.) take effect on the next launch. Shared by manual start
// (routes/server/lifecycle.js POST /start) and scheduled restarts
// (services/scheduler.js performRestart) so both paths stay in sync — see
// upstream fpsacha@ab3700c1: scheduled restarts used to skip this step
// entirely, letting the on-disk script drift from the DB.
// No-op for servers with a custom startCommand or no installPath — nothing
// generated by this module applies to them.
export async function regenerateStartupScriptsForServer(server) {
  if (!server || server.startCommand || !server.installPath) {
    return { success: true, skipped: true };
  }

  try {
    const scripts = await generateStartupScripts({
      installPath: server.installPath,
      serverName: server.serverName,
      minMemory: server.minMemory || 4,
      maxMemory: server.maxMemory || 8,
      zomboidDataPath: server.zomboidDataPath || "",
      adminPassword: server.adminPassword || "",
      serverPort: server.serverPort || 16261,
      useNoSteam: server.useNoSteam || false,
      useDebug: server.useDebug || false,
    });
    writeStartupScriptFiles(server.installPath, server.serverName, scripts);
    return { success: true };
  } catch (error) {
    log.warn(`Could not regenerate startup scripts: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Writes both the .bat and .sh startup scripts generated by
// generateStartupScripts() to `installPath`, using the same filenames and
// file modes as the original inline code in /install, /quick-setup and
// /start. Returns the paths written so callers can log/emit as they did
// before (the log/emit text differs slightly per call site, so that stays
// with the caller).
export function writeStartupScriptFiles(installPath, serverName, scripts) {
  const isWindows = process.platform === "win32";

  // Only write the script for the current platform — a .sh on Windows
  // (or .bat on Linux) just confuses users who don't need it.
  if (isWindows) {
    const batchPath = path.join(installPath, `StartServer_${serverName}.bat`);
    writeFileAtomic(batchPath, scripts.bat, "utf8");
    return { batchPath, shellPath: null };
  }

  const shellPath = path.join(installPath, `start-server_${serverName}.sh`);
  writeFileAtomic(shellPath, scripts.sh.replace(/\r\n/g, "\n"), {
    encoding: "utf8",
    mode: 0o750,
  });
  return { batchPath: null, shellPath };
}
