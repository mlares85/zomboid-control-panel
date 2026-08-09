import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const mkdir = vi.fn();
const fastPut = vi.fn();
const fastGet = vi.fn();
const list = vi.fn();
const exists = vi.fn();
const del = vi.fn();
const end = vi.fn();

vi.mock("ssh2-sftp-client", () => ({
  // A regular function (not an arrow function) so `new SftpClient(...)` works —
  // returning an object from a constructor call overrides the default `this`.
  default: vi.fn().mockImplementation(function () {
    return { connect, mkdir, fastPut, fastGet, list, exists, delete: del, end };
  }),
}));

const { SftpDestination, validateSftpDestinationConfig } = await import(
  "../services/backupDestinations/sftp.js"
);

const baseConfig = {
  host: "backup-host",
  port: 22,
  username: "pzadmin",
  password: "secret",
  path: "/mnt/backups/",
};

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockResolvedValue();
  end.mockResolvedValue();
});

describe("validateSftpDestinationConfig", () => {
  it("normalizes a trailing slash off the remote path", () => {
    expect(validateSftpDestinationConfig(baseConfig).path).toBe("/mnt/backups");
  });

  it("rejects a missing host", () => {
    expect(() => validateSftpDestinationConfig({ ...baseConfig, host: "" })).toThrow(/host/i);
  });

  it("rejects an out-of-range port", () => {
    expect(() => validateSftpDestinationConfig({ ...baseConfig, port: 99999 })).toThrow(/port/i);
  });

  it("rejects a missing remote path", () => {
    expect(() => validateSftpDestinationConfig({ ...baseConfig, path: "" })).toThrow(/path/i);
  });
});

describe("SftpDestination", () => {
  it("upload() connects, ensures the directory exists, and fastPuts the file", async () => {
    const destination = new SftpDestination(baseConfig);
    const result = await destination.upload("/tmp/backup.zip", "backup.zip");

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: "backup-host", username: "pzadmin" }),
    );
    expect(mkdir).toHaveBeenCalledWith("/mnt/backups", true);
    expect(fastPut).toHaveBeenCalledWith("/tmp/backup.zip", "/mnt/backups/backup.zip");
    expect(result.success).toBe(true);
    expect(end).toHaveBeenCalled();
  });

  it("upload() strips directory components from a hostile remoteName", async () => {
    const destination = new SftpDestination(baseConfig);
    await destination.upload("/tmp/backup.zip", "../../evil.zip");
    expect(fastPut).toHaveBeenCalledWith("/tmp/backup.zip", "/mnt/backups/evil.zip");
  });

  it("list() returns only files, mapped to name/size/modified", async () => {
    exists.mockResolvedValue(true);
    list.mockResolvedValue([
      { type: "-", name: "a.zip", size: 10, modifyTime: 1700000000000 },
      { type: "d", name: "subdir" },
    ]);

    const destination = new SftpDestination(baseConfig);
    const results = await destination.list();

    expect(results).toEqual([
      { name: "a.zip", size: 10, modified: new Date(1700000000000).toISOString() },
    ]);
  });

  it("list() returns [] when the remote directory doesn't exist", async () => {
    exists.mockResolvedValue(false);
    const destination = new SftpDestination(baseConfig);
    expect(await destination.list()).toEqual([]);
  });

  it("test() reports success with a latency measurement", async () => {
    exists.mockResolvedValue(true);
    const destination = new SftpDestination(baseConfig);
    const result = await destination.test();
    expect(result.success).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("test() reports failure without throwing when connect() rejects", async () => {
    connect.mockRejectedValue(new Error("ECONNREFUSED"));
    const destination = new SftpDestination(baseConfig);
    const result = await destination.test();
    expect(result).toEqual({ success: false, message: "ECONNREFUSED" });
  });

  it("always closes the client, even after a failure", async () => {
    fastPut.mockRejectedValue(new Error("disk full"));
    const destination = new SftpDestination(baseConfig);
    await expect(destination.upload("/tmp/x.zip", "x.zip")).rejects.toThrow("disk full");
    expect(end).toHaveBeenCalled();
  });
});
