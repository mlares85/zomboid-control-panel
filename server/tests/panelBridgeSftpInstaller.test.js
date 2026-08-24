import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSourcePath } from "../services/panelBridgeInstaller.js";

const connect = vi.fn();
const mkdir = vi.fn();
const fastPut = vi.fn();
const end = vi.fn();

vi.mock("ssh2-sftp-client", () => ({
  // A regular function (not an arrow function) so `new SftpClient(...)` works —
  // returning an object from a constructor call overrides the default `this`.
  default: vi.fn().mockImplementation(function () {
    return { connect, mkdir, fastPut, end };
  }),
}));

const { installBridgeViaSftp } = await import(
  "../services/panelBridgeSftpInstaller.js"
);

const sftpConfig = {
  host: "pz.example.net",
  port: 22,
  username: "pzuser",
  password: "not-a-real-secret",
};

const installPath = "/home/pzuser/pzserver";

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockResolvedValue();
  mkdir.mockResolvedValue();
  fastPut.mockResolvedValue();
  end.mockResolvedValue();
});

describe("installBridgeViaSftp", () => {
  it("connects, creates the remote lua/server dir, and uploads the mod", async () => {
    const result = await installBridgeViaSftp(sftpConfig, installPath);

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: "pz.example.net", username: "pzuser" }),
    );
    expect(mkdir).toHaveBeenCalledWith(
      "/home/pzuser/pzserver/media/lua/server",
      true,
    );
    expect(fastPut).toHaveBeenCalledWith(
      await resolveSourcePath(),
      "/home/pzuser/pzserver/media/lua/server/PanelBridge.lua",
    );
    expect(result).toEqual({
      success: true,
      remotePath: "/home/pzuser/pzserver/media/lua/server/PanelBridge.lua",
    });
    expect(end).toHaveBeenCalled();
  });

  it("strips a trailing slash off installPath before building the remote path", async () => {
    await installBridgeViaSftp(sftpConfig, "/home/pzuser/pzserver/");
    expect(mkdir).toHaveBeenCalledWith(
      "/home/pzuser/pzserver/media/lua/server",
      true,
    );
  });

  it("returns {success:false, error} when connect() rejects, and still disconnects", async () => {
    connect.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await installBridgeViaSftp(sftpConfig, installPath);

    expect(result).toEqual({ success: false, error: "ECONNREFUSED" });
    expect(end).toHaveBeenCalled();
  });

  it("returns {success:false, error} when mkdir() fails, and still disconnects", async () => {
    mkdir.mockRejectedValue(new Error("Permission denied"));

    const result = await installBridgeViaSftp(sftpConfig, installPath);

    expect(result).toEqual({ success: false, error: "Permission denied" });
    expect(end).toHaveBeenCalled();
  });

  it("returns {success:false, error} when fastPut() fails, and still disconnects", async () => {
    fastPut.mockRejectedValue(new Error("No space left on device"));

    const result = await installBridgeViaSftp(sftpConfig, installPath);

    expect(result).toEqual({ success: false, error: "No space left on device" });
    expect(end).toHaveBeenCalled();
  });

  it("disconnects cleanly even if end() itself rejects", async () => {
    end.mockRejectedValue(new Error("already closed"));

    const result = await installBridgeViaSftp(sftpConfig, installPath);

    expect(result.success).toBe(true);
  });
});

describe("installBridgeViaSftp with missing source mod", () => {
  it("fails without connecting when the source PanelBridge.lua cannot be found", async () => {
    vi.resetModules();
    vi.doMock("../services/panelBridgeInstaller.js", async () => {
      const actual = await vi.importActual("../services/panelBridgeInstaller.js");
      return { ...actual, resolveSourcePath: vi.fn().mockResolvedValue(null) };
    });

    const { installBridgeViaSftp: installWithoutSource } = await import(
      "../services/panelBridgeSftpInstaller.js"
    );

    const result = await installWithoutSource(sftpConfig, installPath);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/source not found/i);
    expect(connect).not.toHaveBeenCalled();

    vi.doUnmock("../services/panelBridgeInstaller.js");
  });
});
