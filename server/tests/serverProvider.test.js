import { describe, it, expect, vi, beforeEach } from "vitest";

// isContainerized reads real filesystem markers; mock it so the
// docker-local branch of detectProvider is deterministic in CI regardless
// of whether the test runner itself happens to be containerized.
vi.mock("../utils/dockerDetect.js", () => ({
  isContainerized: vi.fn(),
}));

const { isContainerized } = await import("../utils/dockerDetect.js");
const {
  PROVIDERS,
  isValidProvider,
  detectProvider,
  isRemoteProvider,
  isLocalFileAccess,
  isDockerManaged,
} = await import("../utils/serverProvider.js");

describe("isValidProvider", () => {
  it("accepts every known provider", () => {
    for (const value of Object.values(PROVIDERS)) {
      expect(isValidProvider(value)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isValidProvider("remote")).toBe(false);
    expect(isValidProvider("")).toBe(false);
    expect(isValidProvider(undefined)).toBe(false);
    expect(isValidProvider(null)).toBe(false);
  });
});

describe("detectProvider", () => {
  beforeEach(() => {
    isContainerized.mockReset();
  });

  it("returns remote-sftp when paths are configured but don't exist locally", () => {
    isContainerized.mockReturnValue(false);
    expect(
      detectProvider({ isRemote: false, pathsConfigured: true, pathsExistLocally: false }),
    ).toBe(PROVIDERS.REMOTE_SFTP);
  });

  it("returns remote-sftp when no paths are configured and legacy isRemote was true", () => {
    isContainerized.mockReturnValue(false);
    expect(
      detectProvider({ isRemote: true, pathsConfigured: false, pathsExistLocally: false }),
    ).toBe(PROVIDERS.REMOTE_SFTP);
  });

  it("returns native when paths exist locally and the panel isn't containerized", () => {
    isContainerized.mockReturnValue(false);
    expect(
      detectProvider({ isRemote: false, pathsConfigured: true, pathsExistLocally: true }),
    ).toBe(PROVIDERS.NATIVE);
  });

  it("returns docker-local when paths exist locally and the panel is containerized", () => {
    isContainerized.mockReturnValue(true);
    expect(
      detectProvider({ isRemote: false, pathsConfigured: true, pathsExistLocally: true }),
    ).toBe(PROVIDERS.DOCKER_LOCAL);
  });

  it("returns native when no paths are configured and legacy isRemote was false", () => {
    isContainerized.mockReturnValue(false);
    expect(
      detectProvider({ isRemote: false, pathsConfigured: false, pathsExistLocally: false }),
    ).toBe(PROVIDERS.NATIVE);
  });
});

describe("isRemoteProvider / isLocalFileAccess / isDockerManaged", () => {
  it("treats only remote-sftp as remote / lacking local file access", () => {
    for (const provider of [
      PROVIDERS.NATIVE,
      PROVIDERS.DOCKER_LOCAL,
      PROVIDERS.DOCKER_MANAGED,
    ]) {
      expect(isRemoteProvider({ provider })).toBe(false);
      expect(isLocalFileAccess({ provider })).toBe(true);
    }
    expect(isRemoteProvider({ provider: PROVIDERS.REMOTE_SFTP })).toBe(true);
    expect(isLocalFileAccess({ provider: PROVIDERS.REMOTE_SFTP })).toBe(false);
  });

  it("treats a missing/null server as non-remote with local access, matching the old ?.isRemote guard", () => {
    expect(isRemoteProvider(null)).toBe(false);
    expect(isRemoteProvider(undefined)).toBe(false);
    expect(isLocalFileAccess(null)).toBe(true);
    expect(isLocalFileAccess(undefined)).toBe(true);
  });

  it("identifies docker-managed servers only", () => {
    expect(isDockerManaged({ provider: PROVIDERS.DOCKER_MANAGED })).toBe(true);
    expect(isDockerManaged({ provider: PROVIDERS.NATIVE })).toBe(false);
    expect(isDockerManaged(null)).toBe(false);
  });
});
