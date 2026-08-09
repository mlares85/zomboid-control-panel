// Turns the raw platform + Docker-runtime detection into onboarding
// guidance: can this OS run PZ natively, can it run PZ in Docker, and if
// neither, what should the user go install? macOS can never run the PZ
// dedicated server binary natively (Linux-only), so it's the only platform
// that gets install recommendations when Docker isn't available.
const MAC_DOCKER_RECOMMENDATIONS = [
  {
    type: "install-docker",
    label: "Install OrbStack",
    url: "https://orbstack.dev",
    description: "Lightweight Docker for macOS — run PZ server in a Linux container",
  },
  {
    type: "install-docker",
    label: "Install Docker Desktop",
    url: "https://www.docker.com/products/docker-desktop",
    description: "Official Docker for macOS — run PZ server in a Linux container",
  },
];

export function buildPlatformGuidance({ platform, dockerRuntime }) {
  const canRunDocker = dockerRuntime != null;
  const canRunNative = platform !== "darwin";
  const recommendations = platform === "darwin" && !canRunDocker ? MAC_DOCKER_RECOMMENDATIONS : [];

  return {
    platform,
    canRunNative,
    canRunDocker,
    dockerRuntime: dockerRuntime ?? null,
    recommendations,
  };
}
