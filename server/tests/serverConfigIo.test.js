import { describe, expect, it } from "vitest";
import path from "path";
import {
  parseIni,
  findServerConfigPath,
  readServerConfig,
  writeServerConfig,
  extractModList,
  extractGamePort,
} from "../services/serverConfigIo.js";

/** Minimal in-memory fake satisfying the FileAccess contract used here. */
function createFakeFiles(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    async exists(filePath) {
      return files.has(filePath);
    },
    async readFile(filePath) {
      if (!files.has(filePath)) {
        return { success: false, error: "ENOENT" };
      }
      return { success: true, data: files.get(filePath) };
    },
    async writeFile(filePath, data) {
      files.set(filePath, data);
      return { success: true };
    },
  };
}

describe("parseIni", () => {
  it("parses key=value pairs", () => {
    const content = "PVP=false\nDefaultPort=16261\n";
    expect(parseIni(content)).toEqual({
      PVP: "false",
      DefaultPort: "16261",
    });
  });

  it("skips blank lines and comments", () => {
    const content = "# a comment\n\n; also a comment\nMaxPlayers=16\n";
    expect(parseIni(content)).toEqual({ MaxPlayers: "16" });
  });

  it("preserves = characters within a value", () => {
    const content = "Password=a=b=c\n";
    expect(parseIni(content)).toEqual({ Password: "a=b=c" });
  });

  it("ignores malformed lines with no value", () => {
    const content = "NoEquals\nKey=\n";
    expect(parseIni(content)).toEqual({ Key: "" });
  });
});

describe("findServerConfigPath", () => {
  const savePath = "/save";
  const serverName = "MyServer";

  it("returns null when savePath is falsy", async () => {
    const files = createFakeFiles();
    expect(await findServerConfigPath(null, serverName, files)).toBeNull();
  });

  it("prefers Server/{serverName}.ini when present", async () => {
    const preferred = path.join(savePath, "Server", `${serverName}.ini`);
    const files = createFakeFiles({ [preferred]: "" });
    expect(await findServerConfigPath(savePath, serverName, files)).toBe(
      preferred,
    );
  });

  it("falls back to {serverName}.ini directly under savePath", async () => {
    const fallback = path.join(savePath, `${serverName}.ini`);
    const files = createFakeFiles({ [fallback]: "" });
    expect(await findServerConfigPath(savePath, serverName, files)).toBe(
      fallback,
    );
  });

  it("falls back to servertest.ini", async () => {
    const legacy = path.join(savePath, "servertest.ini");
    const files = createFakeFiles({ [legacy]: "" });
    expect(await findServerConfigPath(savePath, serverName, files)).toBe(
      legacy,
    );
  });

  it("falls back to serveroptions.ini", async () => {
    const alt = path.join(savePath, "serveroptions.ini");
    const files = createFakeFiles({ [alt]: "" });
    expect(await findServerConfigPath(savePath, serverName, files)).toBe(alt);
  });

  it("returns null when no candidate exists", async () => {
    const files = createFakeFiles();
    expect(
      await findServerConfigPath(savePath, serverName, files),
    ).toBeNull();
  });
});

describe("readServerConfig", () => {
  const savePath = "/save";
  const serverName = "MyServer";

  it("returns null when no config file is found", async () => {
    const files = createFakeFiles();
    expect(await readServerConfig(savePath, serverName, files)).toBeNull();
  });

  it("reads and parses the resolved config file", async () => {
    const preferred = path.join(savePath, "Server", `${serverName}.ini`);
    const files = createFakeFiles({
      [preferred]: "DefaultPort=16261\nMods=ModA;ModB\n",
    });
    expect(await readServerConfig(savePath, serverName, files)).toEqual({
      DefaultPort: "16261",
      Mods: "ModA;ModB",
    });
  });

  it("returns null when the read fails", async () => {
    const preferred = path.join(savePath, "Server", `${serverName}.ini`);
    const files = createFakeFiles({ [preferred]: "" });
    files.readFile = async () => ({ success: false, error: "boom" });
    expect(await readServerConfig(savePath, serverName, files)).toBeNull();
  });
});

describe("writeServerConfig", () => {
  const savePath = "/save";
  const serverName = "MyServer";

  it("creates servertest.ini with given keys when no config file exists yet", async () => {
    const files = createFakeFiles();
    await writeServerConfig(
      savePath,
      serverName,
      { PVP: "true" },
      files,
    );
    const target = path.join(savePath, "servertest.ini");
    expect(files.files.get(target)).toContain("PVP=true");
  });

  it("patches an existing key in place, preserving other content", async () => {
    const target = path.join(savePath, "Server", `${serverName}.ini`);
    const files = createFakeFiles({
      [target]: "# comment\nPVP=false\nMaxPlayers=16\n",
    });
    await writeServerConfig(savePath, serverName, { PVP: "true" }, files);
    const content = files.files.get(target);
    expect(content).toContain("PVP=true");
    expect(content).toContain("MaxPlayers=16");
    expect(content).toContain("# comment");
  });

  it("skips invalid config keys", async () => {
    const files = createFakeFiles();
    await writeServerConfig(
      savePath,
      serverName,
      { "bad key!": "x", GoodKey: "y" },
      files,
    );
    const target = path.join(savePath, "servertest.ini");
    const content = files.files.get(target);
    expect(content).not.toContain("bad key!");
    expect(content).toContain("GoodKey=y");
  });

  it("strips newlines from values to prevent INI injection", async () => {
    const files = createFakeFiles();
    await writeServerConfig(
      savePath,
      serverName,
      { PVP: "true\nAdmin=1" },
      files,
    );
    const target = path.join(savePath, "servertest.ini");
    const content = files.files.get(target);
    expect(content).toContain("PVP=trueAdmin=1");
  });
});

describe("extractModList", () => {
  it("returns an empty array when there are no mods", () => {
    expect(extractModList({})).toEqual([]);
    expect(extractModList(null)).toEqual([]);
  });

  it("pairs mods with their workshop ids by index", () => {
    const config = { Mods: "ModA;ModB", WorkshopItems: "111;222" };
    expect(extractModList(config)).toEqual([
      { name: "ModA", workshopId: "111" },
      { name: "ModB", workshopId: "222" },
    ]);
  });

  it("uses null workshopId when WorkshopItems is missing", () => {
    const config = { Mods: "ModA" };
    expect(extractModList(config)).toEqual([
      { name: "ModA", workshopId: null },
    ]);
  });
});

describe("extractGamePort", () => {
  it("returns null when DefaultPort is absent", () => {
    expect(extractGamePort({})).toBeNull();
    expect(extractGamePort(null)).toBeNull();
  });

  it("parses DefaultPort as an integer", () => {
    expect(extractGamePort({ DefaultPort: "16261" })).toBe(16261);
  });
});
