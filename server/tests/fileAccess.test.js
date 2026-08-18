import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { LocalFiles } from "../services/fileAccess/LocalFiles.js";

let dir;
let files;

beforeEach(() => {
  dir = path.join(os.tmpdir(), `pz-fileaccess-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  files = new LocalFiles();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("exists / stat / access", () => {
  it("exists() returns true for an existing file, false for missing", async () => {
    const fp = path.join(dir, "hello.txt");
    fs.writeFileSync(fp, "hi");
    expect(await files.exists(fp)).toBe(true);
    expect(await files.exists(path.join(dir, "nope.txt"))).toBe(false);
  });

  it("stat() returns size and isDirectory, null for missing", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "abcde");
    const s = await files.stat(path.join(dir, "a.txt"));
    expect(s.size).toBe(5);
    expect(s.isDirectory).toBe(false);

    const ds = await files.stat(dir);
    expect(ds.isDirectory).toBe(true);

    expect(await files.stat(path.join(dir, "missing"))).toBeNull();
  });

  it("access('read') returns true for readable file, false for missing", async () => {
    const fp = path.join(dir, "r.txt");
    fs.writeFileSync(fp, "ok");
    expect(await files.access(fp, "read")).toBe(true);
    expect(await files.access(path.join(dir, "gone"), "read")).toBe(false);
  });

  it("access('write') returns true for writable directory", async () => {
    expect(await files.access(dir, "write")).toBe(true);
  });
});

describe("readFile / readFileBinary / readBytes", () => {
  it("readFile() returns {success:true, data} for existing file", async () => {
    const fp = path.join(dir, "content.txt");
    fs.writeFileSync(fp, "hello world");
    const result = await files.readFile(fp);
    expect(result).toEqual({ success: true, data: "hello world" });
  });

  it("readFile() returns {success:false, error} for missing file", async () => {
    const result = await files.readFile(path.join(dir, "nope.txt"));
    expect(result.success).toBe(false);
    expect(result.error).toBeTypeOf("string");
  });

  it("readFileBinary() returns {success:true, data: Buffer}", async () => {
    const fp = path.join(dir, "bin.dat");
    const buf = Buffer.from([0x00, 0xff, 0x42]);
    fs.writeFileSync(fp, buf);
    const out = await files.readFileBinary(fp);
    expect(out.success).toBe(true);
    expect(Buffer.isBuffer(out.data)).toBe(true);
    expect(out.data).toEqual(buf);
  });

  it("readBytes() reads correct slice from offset", async () => {
    const fp = path.join(dir, "slice.dat");
    fs.writeFileSync(fp, "abcdefghij");
    const result = await files.readBytes(fp, 3, 4);
    expect(result.success).toBe(true);
    expect(result.data.toString()).toBe("defg");
  });
});

describe("writeFile", () => {
  it("creates a new file and returns {success:true}", async () => {
    const fp = path.join(dir, "new.txt");
    const result = await files.writeFile(fp, "content");
    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(fp, "utf8")).toBe("content");
  });

  it("with {atomic:true} still creates the file correctly", async () => {
    const fp = path.join(dir, "atomic.txt");
    const result = await files.writeFile(fp, "safe", { atomic: true });
    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(fp, "utf8")).toBe("safe");
  });

  it("returns {success:false} for invalid path", async () => {
    const fp = path.join(dir, "no-such-dir", "sub", "file.txt");
    const result = await files.writeFile(fp, "nope");
    expect(result.success).toBe(false);
    expect(result.error).toBeTypeOf("string");
  });
});

describe("readdir / mkdir", () => {
  it("readdir() lists files in a directory", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "");
    fs.writeFileSync(path.join(dir, "b.txt"), "");
    const items = await files.readdir(dir);
    expect(items.sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("readdir({withFileTypes:true}) returns objects with isDirectory/isFile", async () => {
    fs.writeFileSync(path.join(dir, "file.txt"), "");
    fs.mkdirSync(path.join(dir, "subdir"));
    const entries = await files.readdir(dir, { withFileTypes: true });
    const file = entries.find((e) => e.name === "file.txt");
    const sub = entries.find((e) => e.name === "subdir");
    expect(file.isFile).toBe(true);
    expect(sub.isDirectory).toBe(true);
  });

  it("mkdir({recursive:true}) creates nested directories", async () => {
    const nested = path.join(dir, "a", "b", "c");
    await files.mkdir(nested, { recursive: true });
    expect(fs.statSync(nested).isDirectory()).toBe(true);
  });
});

describe("unlink / rm", () => {
  it("unlink() removes a file and returns {success:true}", async () => {
    const fp = path.join(dir, "del.txt");
    fs.writeFileSync(fp, "bye");
    expect(await files.unlink(fp)).toEqual({ success: true });
    expect(fs.existsSync(fp)).toBe(false);
  });

  it("unlink() returns {success:false} for missing file", async () => {
    const result = await files.unlink(path.join(dir, "ghost.txt"));
    expect(result.success).toBe(false);
    expect(result.error).toBeTypeOf("string");
  });

  it("rm({recursive:true}) removes a directory tree", async () => {
    const sub = path.join(dir, "tree", "leaf");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "f.txt"), "");
    await files.rm(path.join(dir, "tree"), { recursive: true });
    expect(fs.existsSync(path.join(dir, "tree"))).toBe(false);
  });
});

describe("rename / copyFile", () => {
  it("rename() moves a file", async () => {
    const src = path.join(dir, "old.txt");
    const dest = path.join(dir, "new.txt");
    fs.writeFileSync(src, "moved");
    await files.rename(src, dest);
    expect(fs.existsSync(src)).toBe(false);
    expect(fs.readFileSync(dest, "utf8")).toBe("moved");
  });

  it("copyFile() duplicates a file", async () => {
    const src = path.join(dir, "orig.txt");
    const dest = path.join(dir, "copy.txt");
    fs.writeFileSync(src, "dup");
    await files.copyFile(src, dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("dup");
    expect(fs.existsSync(src)).toBe(true);
  });
});

describe("chmod", () => {
  it("changes file permissions (verified via stat)", async () => {
    const fp = path.join(dir, "perms.txt");
    fs.writeFileSync(fp, "");
    await files.chmod(fp, 0o444);
    const s = await files.stat(fp);
    expect(s.mode & 0o777).toBe(0o444);
  });
});

describe("createReadStream / createWriteStream", () => {
  it("createReadStream() returns a readable stream with correct data", async () => {
    const fp = path.join(dir, "stream-r.txt");
    fs.writeFileSync(fp, "streamed");
    const chunks = [];
    const stream = files.createReadStream(fp);
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("streamed");
  });

  it("createWriteStream() creates a file with streamed data", async () => {
    const fp = path.join(dir, "stream-w.txt");
    const ws = files.createWriteStream(fp);
    await new Promise((resolve, reject) => {
      ws.write("hello ");
      ws.end("stream", resolve);
      ws.on("error", reject);
    });
    expect(fs.readFileSync(fp, "utf8")).toBe("hello stream");
  });
});

describe("withSession", () => {
  it("passes an empty object to the callback", async () => {
    let received;
    await files.withSession({}, (ctx) => { received = ctx; });
    expect(received).toEqual({});
  });

  it("returns the callback's return value", async () => {
    const result = await files.withSession({}, () => 42);
    expect(result).toBe(42);
  });
});

describe("contract: error handling", () => {
  it("mutating operations never throw — always return {success, error}", async () => {
    const bad = path.join(dir, "no", "such", "deep", "path.txt");
    const ops = [
      files.writeFile(bad, "x"),
      files.unlink(bad),
      files.rename(bad, bad + ".moved"),
      files.copyFile(bad, bad + ".copy"),
      files.rm(bad),
    ];
    const results = await Promise.all(ops);
    for (const r of results) {
      expect(r).toHaveProperty("success", false);
      expect(r).toHaveProperty("error");
    }
  });

  it("exists() never throws — always returns boolean", async () => {
    expect(await files.exists("/no/such/path/ever")).toBe(false);
    expect(await files.exists(dir)).toBe(true);
  });
});
