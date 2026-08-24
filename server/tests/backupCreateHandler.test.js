import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(),
}));

vi.mock("../services/backupOrchestrator.js", () => ({
  createEnhancedBackup: vi.fn(async () => ({ success: true, backup: {} })),
  uploadToDestinations: vi.fn(),
  resolvePlayerCount: vi.fn(),
  resolveWorldAge: vi.fn(),
}));

vi.mock("../services/dockerBackup.js", () => ({
  createDockerBackup: vi.fn(async () => ({ success: true, backup: {}, destinationErrors: [] })),
}));

const { getActiveServer } = await import("../database/init.js");
const { createEnhancedBackup } = await import("../services/backupOrchestrator.js");
const { createDockerBackup } = await import("../services/dockerBackup.js");
const { handleCreateBackup } = await import("../routes/backupCreateHandler.js");

function fakeReqRes(body = {}, appGets = {}) {
  const req = {
    body,
    app: {
      get: vi.fn((key) => appGets[key] ?? null),
    },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

describe("handleCreateBackup routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks remote servers", async () => {
    getActiveServer.mockResolvedValue({ isRemote: true, provider: "remote-sftp" });
    const { req, res } = fakeReqRes();

    await handleCreateBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("remote") }));
  });

  it("routes Docker-managed servers to createDockerBackup", async () => {
    getActiveServer.mockResolvedValue({ provider: "docker-managed", dockerContainerId: "abc" });
    const dockerClient = { available: true };
    const backupService = {};
    const io = { emit: vi.fn() };
    const { req, res } = fakeReqRes(
      { destinations: ["local"] },
      { dockerClient, backupService, io, rconService: null },
    );

    await handleCreateBackup(req, res);

    expect(createDockerBackup).toHaveBeenCalledWith(
      { dockerClient, backupService, io, rconService: null },
      { destinations: ["local"] },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("rejects Docker-managed backup when Docker socket is unavailable", async () => {
    getActiveServer.mockResolvedValue({ provider: "docker-managed" });
    const { req, res } = fakeReqRes({}, { dockerClient: { available: false } });

    await handleCreateBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Docker socket") }));
  });

  it("routes enhanced options to createEnhancedBackup for non-Docker servers", async () => {
    getActiveServer.mockResolvedValue({ provider: "native" });
    const backupService = {};
    const io = { emit: vi.fn() };
    const { req, res } = fakeReqRes(
      { format: "tar.gz" },
      { backupService, io, rconService: null },
    );

    await handleCreateBackup(req, res);

    expect(createEnhancedBackup).toHaveBeenCalled();
    expect(createDockerBackup).not.toHaveBeenCalled();
  });

  it("routes plain requests to backupService.createBackup", async () => {
    getActiveServer.mockResolvedValue({ provider: "native" });
    const createBackup = vi.fn(async () => ({ success: true }));
    const backupService = { createBackup };
    const { req, res } = fakeReqRes({}, { backupService, io: null, rconService: null });

    await handleCreateBackup(req, res);

    expect(createBackup).toHaveBeenCalled();
    expect(createEnhancedBackup).not.toHaveBeenCalled();
    expect(createDockerBackup).not.toHaveBeenCalled();
  });
});
