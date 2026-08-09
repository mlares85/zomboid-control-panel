import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const getTrackedMods = vi.fn(async () => []);

vi.mock("../database/init.js", () => ({
  getTrackedMods,
}));

const { captureServerSnapshot } = await import("../utils/serverSnapshot.js");

let root;
let configPath;

beforeEach(() => {
  getTrackedMods.mockReset();
  getTrackedMods.mockResolvedValue([]);
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-snapshot-"));
  configPath = path.join(root, "Server");
  fs.mkdirSync(configPath, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function activeServer(overrides = {}) {
  return {
    id: "server-1",
    serverName: "servertest",
    provider: "docker-local",
    installPath: "/pz-server",
    zomboidDataPath: root,
    ...overrides,
  };
}

describe("captureServerSnapshot", () => {
  it("reads the current server INI, keeping only the curated key list", async () => {
    fs.writeFileSync(
      path.join(configPath, "servertest.ini"),
      [
        "MaxPlayers=8",
        "PVP=false",
        "Map=Muldraugh, KY",
        "ServerName=servertest", // not in the allowlist — excluded
      ].join("\n"),
    );

    const snapshot = await captureServerSnapshot({ activeServer: activeServer() });

    expect(snapshot.serverIni).toEqual({
      MaxPlayers: "8",
      PVP: "false",
      Map: "Muldraugh, KY",
    });
  });

  it("never includes RCON/admin passwords, even if present in the INI", async () => {
    fs.writeFileSync(
      path.join(configPath, "servertest.ini"),
      ["MaxPlayers=8", "RCONPassword=supersecret", "Password=alsosecret", "AdminPassword=nope"].join("\n"),
    );

    const snapshot = await captureServerSnapshot({ activeServer: activeServer() });

    const values = JSON.stringify(snapshot.serverIni);
    expect(values).not.toMatch(/supersecret|alsosecret/);
    expect(snapshot.serverIni).not.toHaveProperty("RCONPassword");
    expect(snapshot.serverIni).not.toHaveProperty("Password");
    expect(snapshot.serverIni).not.toHaveProperty("AdminPassword");
  });

  it("reads SandboxVars top-level settings, skipping nested blocks", async () => {
    fs.writeFileSync(
      path.join(configPath, "servertest_SandboxVars.lua"),
      [
        "SandboxVars = {",
        "VERSION = 4,",
        "Zombies = 2,",
        "XpMultiplier = 0.5,",
        "ZombieLore = {",
        "Speed = 2,",
        "},",
        "}",
      ].join("\n"),
    );

    const snapshot = await captureServerSnapshot({ activeServer: activeServer() });

    expect(snapshot.sandboxVars).toEqual({ Zombies: 2, XpMultiplier: 0.5 });
  });

  it("maps the server's tracked mods list into workshopId/name pairs", async () => {
    getTrackedMods.mockResolvedValue([
      { workshop_id: "2169435993", name: "Minimal Display Bars" },
    ]);

    const snapshot = await captureServerSnapshot({ activeServer: activeServer() });

    expect(snapshot.mods).toEqual([
      { workshopId: "2169435993", modId: null, name: "Minimal Display Bars" },
    ]);
  });

  it("passes through playerCount/worldAge/saveSize and identifying server fields", async () => {
    const snapshot = await captureServerSnapshot({
      activeServer: activeServer(),
      playerCount: 3,
      worldAge: "Day 14",
      saveSize: 524288000,
    });

    expect(snapshot).toMatchObject({
      serverName: "servertest",
      serverId: "server-1",
      provider: "docker-local",
      installPath: "/pz-server",
      zomboidDataPath: root,
      playerCount: 3,
      worldAge: "Day 14",
      saveSize: 524288000,
    });
  });

  it("returns empty config sections when no INI/SandboxVars files exist yet", async () => {
    const snapshot = await captureServerSnapshot({ activeServer: activeServer() });
    expect(snapshot.serverIni).toEqual({});
    expect(snapshot.sandboxVars).toEqual({});
  });

  it("handles a missing active server without throwing", async () => {
    const snapshot = await captureServerSnapshot({ activeServer: null });
    expect(snapshot.serverName).toBe("server");
    expect(snapshot.serverId).toBeNull();
    expect(snapshot.mods).toEqual([]);
  });
});
