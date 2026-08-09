// Detects whether the panel itself is running inside a container, and
// whether the host's Docker socket has been bind-mounted into it. Used by
// the first-run onboarding wizard to decide which server-setup path to
// offer (native install vs. Docker-aware flows).
import fs from "fs";

const DOCKER_SOCKET_PATH = "/var/run/docker.sock";

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
