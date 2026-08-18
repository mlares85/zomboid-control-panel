import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";

// In-memory fake SFTP transport — a Map keyed by remote path, standing in
// for the actual host filesystem behind ssh2-sftp-client.
let remoteFiles;

const connect = vi.fn(async () => {});
const end = vi.fn(async () => {});
const stat = vi.fn(async (remotePath) => {
  if (!remoteFiles.has(remotePath)) throw new Error("No such file");
  return { size: remoteFiles.get(remotePath).length, isDirectory: false, modifyTime: Date.now() };
});
const get = vi.fn(async (remotePath) => {
  if (!remoteFiles.has(remotePath)) throw new Error("No such file");
  return remoteFiles.get(remotePath);
});
const put = vi.fn(async (data, remotePath) => {
  remoteFiles.set(remotePath, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
});
const del = vi.fn(async (remotePath) => {
  if (!remoteFiles.has(remotePath)) throw new Error("No such file");
  remoteFiles.delete(remotePath);
});
const rename = vi.fn(async (oldPath, newPath) => {
  remoteFiles.set(newPath, remoteFiles.get(oldPath));
  remoteFiles.delete(oldPath);
});
const list = vi.fn(async () => []);

vi.mock("ssh2-sftp-client", () => ({
  // A regular function (not an arrow function) so `new SftpClient(...)` works —
  // returning an object from a constructor call overrides the default `this`.
  default: vi.fn().mockImplementation(function () {
    return { connect, end, stat, get, put, delete: del, rename, list };
  }),
}));

const { SftpMirrorFiles } = await import("../services/fileAccess/SftpMirrorFiles.js");
const { resetRemoteConfigSession } = await import("../services/remoteConfigFiles.js");

const sftpConfig = {
  host: "mirror-host",
  port: 22,
  username: "pzadmin",
  password: "secret",
  remotePath: "/remote/Server",
};
const serverName = "TestServer";
const remoteIniPath = "/remote/Server/TestServer.ini";

let files;

beforeEach(() => {
  remoteFiles = new Map();
  resetRemoteConfigSession();
  files = new SftpMirrorFiles({ sftpConfig, serverName });
});

afterEach(() => {
  fs.rmSync(files.mirrorDir, { recursive: true, force: true });
});

describe("withSession", () => {
  it("pulls remote files, runs the callback against the mirror, and pushes changes", async () => {
    remoteFiles.set(remoteIniPath, Buffer.from("original"));

    const result = await files.withSession({}, async (session) => {
      const local = path.join(session.mirrorDir, "TestServer.ini");
      expect(fs.readFileSync(local, "utf8")).toBe("original");
      fs.writeFileSync(local, "updated");
      return "done";
    });

    expect(result).toBe("done");
    expect(remoteFiles.get(remoteIniPath).toString()).toBe("updated");
  });

  it("does not push when the callback throws", async () => {
    remoteFiles.set(remoteIniPath, Buffer.from("original"));

    await expect(
      files.withSession({}, async (session) => {
        fs.writeFileSync(path.join(session.mirrorDir, "TestServer.ini"), "changed");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(remoteFiles.get(remoteIniPath).toString()).toBe("original");
  });
});

describe("readFile", () => {
  it("returns the mirror content, pulling first if not yet mirrored", async () => {
    remoteFiles.set(remoteIniPath, Buffer.from("hello from host"));

    const result = await files.readFile("TestServer.ini");

    expect(result).toEqual({ success: true, data: "hello from host" });
  });

  it("returns {success:false, error} when the file does not exist remotely or locally", async () => {
    const result = await files.readFile("TestServer.ini");
    expect(result.success).toBe(false);
    expect(result.error).toBeTypeOf("string");
  });
});

describe("writeFile", () => {
  it("writes to the local mirror without pushing to the remote", async () => {
    const result = await files.writeFile("TestServer.ini", "local edit");
    expect(result).toEqual({ success: true });

    const local = path.join(files.mirrorDir, "TestServer.ini");
    expect(fs.readFileSync(local, "utf8")).toBe("local edit");
    expect(remoteFiles.has(remoteIniPath)).toBe(false);
  });
});

describe("mirror lock", () => {
  it("serializes concurrent sessions so they never overlap", async () => {
    const order = [];
    let active = 0;

    const run = (id) =>
      files.withSession({}, async () => {
        active += 1;
        order.push(`start-${id}`);
        expect(active).toBe(1);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        order.push(`end-${id}`);
      });

    await Promise.all([run(1), run(2)]);

    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });
});

describe("streams", () => {
  it("createReadStream throws a descriptive error", () => {
    expect(() => files.createReadStream("TestServer.ini")).toThrow(
      /not supported for remote servers/i,
    );
  });

  it("createWriteStream throws a descriptive error", () => {
    expect(() => files.createWriteStream("TestServer.ini")).toThrow(
      /not supported for remote servers/i,
    );
  });
});
