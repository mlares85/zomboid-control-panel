// Detects whether the panel itself is running inside a container, and
// whether the host's Docker socket has been bind-mounted into it. Used by
// the first-run onboarding wizard to decide which server-setup path to
// offer (native install vs. Docker-aware flows).
import fs from "fs";
import { execFileSync } from "child_process";

const DOCKER_SOCKET_PATH = "/var/run/docker.sock";
const EXEC_OPTS = { timeout: 3000, stdio: ["ignore", "pipe", "ignore"] };

// Two on-disk markers Docker/Podman leave behind in every container they
// create — cheap existsSync checks, no cgroup parsing, no shelling out.
export function isContainerized() {
  if (process.platform !== "linux") return false;
  try {
    return (
      fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv")
    );
  } catch {
    return false;
  }
}

function hasDockerSocket() {
  try {
    return fs.existsSync(DOCKER_SOCKET_PATH);
  } catch {
    return false;
  }
}

export function getContainerInfo() {
  return {
    containerized: isContainerized(),
    hasDockerSocket: hasDockerSocket(),
  };
}

function tryExec(cmd, args) {
  try {
    return execFileSync(cmd, args, EXEC_OPTS).toString();
  } catch {
    return null;
  }
}

// Best-effort identification of which Docker runtime is installed on the
// host the panel is running on (used for macOS/Windows onboarding guidance,
// where there's no /var/run/docker.sock marker to rely on). Checked
// cheapest/most-specific first: OrbStack ships its own CLI, Docker Desktop
// stamps its name into `docker info`, Colima has its own status command,
// and anything left that answers `docker info` is a native daemon.
export function detectDockerRuntime() {
  if (tryExec("orbstack", ["version"]) !== null) return "orbstack";
  const dockerInfo = tryExec("docker", ["info"]);
  if (dockerInfo === null) return null;
  if (dockerInfo.includes("Docker Desktop")) return "docker-desktop";
  if (tryExec("colima", ["status"]) !== null) return "colima";
  return "native";
}
