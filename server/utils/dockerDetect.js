<<<<<<< HEAD
// Detect whether the panel is running inside a container. Used to decide
// whether Docker-mount auto-discovery is worth attempting/advertising.
import fs from "fs";

// Docker sets /.dockerenv at the container root; Podman uses
// /run/.containerenv. Falls back to a cgroup scan for runtimes (some CI
// sandboxes, older Docker) that skip the marker file entirely.
export function isContainerized() {
  if (fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv")) {
    return true;
  }
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    return /docker|kubepods|containerd/.test(cgroup);
=======
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
>>>>>>> worktree-agent-a9775f51e61877487
  } catch {
    return false;
  }
}

export function getContainerInfo() {
  return {
<<<<<<< HEAD
    isDocker: isContainerized(),
    hasDockerSocket: fs.existsSync("/var/run/docker.sock"),
=======
    containerized: isContainerized(),
    hasDockerSocket: hasDockerSocket(),
>>>>>>> worktree-agent-a9775f51e61877487
  };
}
