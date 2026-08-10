import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createTemplate,
  validateTemplate,
} from "../utils/templateSchema.js";
import {
  captureModsFromIni,
  applyModsToIni,
} from "../utils/templateFiles.js";

// ─── captureModsFromIni (pure function) ────────────────────────────────────

describe("captureModsFromIni", () => {
  it("pairs WorkshopItems and Mods by position", () => {
    const ini = [
      "PVP=true",
      "WorkshopItems=2313387159;2392987599;2778576730",
      "Mods=Arsenal26GunFighter;tsarslib;Brita",
      "PauseEmpty=false",
    ].join("\n");

    const mods = captureModsFromIni(ini);
    expect(mods).toEqual([
      { workshopId: "2313387159", modId: "Arsenal26GunFighter" },
      { workshopId: "2392987599", modId: "tsarslib" },
      { workshopId: "2778576730", modId: "Brita" },
    ]);
  });

  it("returns workshopId-only entries when Mods= is missing", () => {
    const ini = "WorkshopItems=111;222\nPVP=true\n";
    const mods = captureModsFromIni(ini);
    expect(mods).toEqual([
      { workshopId: "111" },
      { workshopId: "222" },
    ]);
  });

  it("handles more WorkshopItems than Mods", () => {
    const ini = "WorkshopItems=111;222;333\nMods=ModA;ModB\n";
    const mods = captureModsFromIni(ini);
    expect(mods).toEqual([
      { workshopId: "111", modId: "ModA" },
      { workshopId: "222", modId: "ModB" },
      { workshopId: "333" },
    ]);
  });

  it("handles more Mods than WorkshopItems", () => {
    const ini = "WorkshopItems=111\nMods=ModA;ModB;ModC\n";
    const mods = captureModsFromIni(ini);
    expect(mods).toEqual([
      { workshopId: "111", modId: "ModA" },
    ]);
  });

  it("returns empty array when neither key exists", () => {
    expect(captureModsFromIni("PVP=true\nPauseEmpty=false\n")).toEqual([]);
  });

  it("returns empty array for empty WorkshopItems", () => {
    expect(captureModsFromIni("WorkshopItems=\nMods=\n")).toEqual([]);
  });

  it("filters out empty segments from trailing semicolons", () => {
    const ini = "WorkshopItems=111;222;\nMods=ModA;ModB;\n";
    const mods = captureModsFromIni(ini);
    expect(mods).toHaveLength(2);
  });
});

// ─── applyModsToIni (pure function) ────────────────────────────────────────

describe("applyModsToIni", () => {
  it("adds mods to empty WorkshopItems and Mods lines", () => {
    const ini = "WorkshopItems=\nMods=\nPVP=true\n";
    const result = applyModsToIni(ini, [
      { workshopId: "111", modId: "ModA" },
      { workshopId: "222", modId: "ModB" },
    ]);
    expect(result).toContain("WorkshopItems=111;222");
    expect(result).toContain("Mods=ModA;ModB");
    expect(result).toContain("PVP=true");
  });

  it("appends to existing mod lists without duplicates", () => {
    const ini = "WorkshopItems=111\nMods=ModA\n";
    const result = applyModsToIni(ini, [
      { workshopId: "111", modId: "ModA" },
      { workshopId: "222", modId: "ModB" },
    ]);
    expect(result).toContain("WorkshopItems=111;222");
    expect(result).toContain("Mods=ModA;ModB");
  });

  it("creates WorkshopItems and Mods lines when absent", () => {
    const ini = "PVP=true\nPauseEmpty=false\n";
    const result = applyModsToIni(ini, [
      { workshopId: "111", modId: "ModA" },
    ]);
    expect(result).toContain("WorkshopItems=111");
    expect(result).toContain("Mods=ModA");
  });

  it("adds workshopId without modId (server auto-detects on start)", () => {
    const ini = "WorkshopItems=\nMods=\n";
    const result = applyModsToIni(ini, [
      { workshopId: "111" },
    ]);
    expect(result).toContain("WorkshopItems=111");
    // Mods= stays empty — no modId to add
    expect(result).toMatch(/^Mods=$/m);
  });

  it("preserves existing mods when adding new ones", () => {
    const ini = "WorkshopItems=111;222\nMods=ModA;ModB\n";
    const result = applyModsToIni(ini, [
      { workshopId: "333", modId: "ModC" },
    ]);
    expect(result).toContain("WorkshopItems=111;222;333");
    expect(result).toContain("Mods=ModA;ModB;ModC");
  });

  it("returns content unchanged for empty mods array", () => {
    const ini = "PVP=true\n";
    expect(applyModsToIni(ini, [])).toBe(ini);
  });
});

// ─── validateTemplate with mod entries ─────────────────────────────────────

describe("validateTemplate mod entries", () => {
  it("accepts mods with workshopId and modId", () => {
    const template = createTemplate({
      name: "With Mods",
      mods: [
        { workshopId: "2313387159", modId: "Arsenal26" },
        { workshopId: "2392987599", modId: "tsarslib" },
      ],
    });
    expect(validateTemplate(template)).toEqual({ valid: true, errors: [] });
  });

  it("accepts mods with workshopId only", () => {
    const template = createTemplate({
      name: "Workshop Only",
      mods: [{ workshopId: "111" }],
    });
    expect(validateTemplate(template)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a mod entry missing workshopId", () => {
    const template = createTemplate({
      name: "Bad Mod",
      mods: [{ modId: "SomeMod" }],
    });
    const { valid, errors } = validateTemplate(template);
    expect(valid).toBe(false);
    expect(errors.join(" ")).toMatch(/workshopId/);
  });

  it("rejects a non-numeric workshopId", () => {
    const template = createTemplate({
      name: "Bad ID",
      mods: [{ workshopId: "not-a-number" }],
    });
    const { valid, errors } = validateTemplate(template);
    expect(valid).toBe(false);
    expect(errors.join(" ")).toMatch(/workshopId/);
  });

  it("rejects a mod entry that is not an object", () => {
    const template = createTemplate({
      name: "Bad Entry",
      mods: ["just-a-string"],
    });
    const { valid, errors } = validateTemplate(template);
    expect(valid).toBe(false);
    expect(errors.join(" ")).toMatch(/must be an object/);
  });

  it("accepts optional name field for display", () => {
    const template = createTemplate({
      name: "Named Mods",
      mods: [{ workshopId: "111", modId: "ModA", name: "Cool Mod" }],
    });
    expect(validateTemplate(template)).toEqual({ valid: true, errors: [] });
  });
});

// ─── applyTemplate with mods ───────────────────────────────────────────────

let userTemplates;

vi.mock("../database/init.js", () => ({
  getServer: vi.fn(),
  getUserTemplates: vi.fn(async () => userTemplates),
  getUserTemplate: vi.fn(async (id) => userTemplates.find((t) => t.meta?.id === id) || null),
  saveUserTemplate: vi.fn(async (template) => {
    const index = userTemplates.findIndex((t) => t.meta?.id === template.meta?.id);
    if (index === -1) userTemplates.push(template);
    else userTemplates[index] = template;
    return template;
  }),
  deleteUserTemplate: vi.fn(async (id) => {
    const before = userTemplates.length;
    userTemplates = userTemplates.filter((t) => t.meta?.id !== id);
    return userTemplates.length < before;
  }),
}));

const { getServer } = await import("../database/init.js");
const templateService = await import("../services/templateService.js");

describe("applyTemplate with mods", () => {
  let dir;

  beforeEach(() => {
    userTemplates = [];
    getServer.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pz-template-mods-"));
    fs.writeFileSync(
      path.join(dir, "TestServer.ini"),
      "PauseEmpty=false\nWorkshopItems=111\nMods=ExistingMod\n",
    );
    getServer.mockResolvedValue({
      id: "server-1",
      serverName: "TestServer",
      serverConfigPath: dir,
      isRemote: false,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes mods to the server INI when applying a template", async () => {
    const template = createTemplate({
      name: "Modded",
      mods: [
        { workshopId: "222", modId: "NewMod" },
        { workshopId: "333", modId: "AnotherMod" },
      ],
    });
    userTemplates.push({ ...template, meta: { ...template.meta, id: "modded" } });

    const result = await templateService.applyTemplate("modded", "server-1");
    expect(result.success).toBe(true);
    expect(result.mods).toEqual({
      added: { workshopItems: 2, modIds: 2 },
    });

    const ini = fs.readFileSync(path.join(dir, "TestServer.ini"), "utf-8");
    expect(ini).toContain("WorkshopItems=111;222;333");
    expect(ini).toContain("Mods=ExistingMod;NewMod;AnotherMod");
  });

  it("deduplicates mods that already exist on the server", async () => {
    const template = createTemplate({
      name: "Overlap",
      mods: [
        { workshopId: "111", modId: "ExistingMod" },
        { workshopId: "444", modId: "FreshMod" },
      ],
    });
    userTemplates.push({ ...template, meta: { ...template.meta, id: "overlap" } });

    const result = await templateService.applyTemplate("overlap", "server-1");
    expect(result.success).toBe(true);

    const ini = fs.readFileSync(path.join(dir, "TestServer.ini"), "utf-8");
    expect(ini).toContain("WorkshopItems=111;444");
    expect(ini).toContain("Mods=ExistingMod;FreshMod");
  });

  it("skips mod apply when options.applyMods is false", async () => {
    const template = createTemplate({
      name: "SkipMods",
      mods: [{ workshopId: "999", modId: "SkippedMod" }],
    });
    userTemplates.push({ ...template, meta: { ...template.meta, id: "skipmods" } });

    const result = await templateService.applyTemplate("skipmods", "server-1", {
      applyMods: false,
    });
    expect(result.success).toBe(true);
    expect(result.mods).toBeNull();

    const ini = fs.readFileSync(path.join(dir, "TestServer.ini"), "utf-8");
    expect(ini).not.toContain("999");
  });

  it("handles a template with empty mods array gracefully", async () => {
    const template = createTemplate({ name: "NoMods" });
    userTemplates.push({ ...template, meta: { ...template.meta, id: "nomods" } });

    const result = await templateService.applyTemplate("nomods", "server-1");
    expect(result.success).toBe(true);
    expect(result.mods).toBeNull();
  });
});

// ─── captureServerConfig with mods ─────────────────────────────────────────

describe("captureServerConfig", () => {
  let dir;

  beforeEach(() => {
    userTemplates = [];
    getServer.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pz-template-capture-"));
    getServer.mockResolvedValue({
      id: "server-1",
      serverName: "TestServer",
      serverConfigPath: dir,
      isRemote: false,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("captures mods from the server INI", async () => {
    fs.writeFileSync(
      path.join(dir, "TestServer.ini"),
      "PVP=true\nWorkshopItems=111;222\nMods=ModA;ModB\nPauseEmpty=false\n",
    );

    const result = await templateService.captureServerConfig("server-1");
    expect(result.success).toBe(true);
    expect(result.config.mods).toEqual([
      { workshopId: "111", modId: "ModA" },
      { workshopId: "222", modId: "ModB" },
    ]);
  });

  it("returns empty mods when server has no mods", async () => {
    fs.writeFileSync(path.join(dir, "TestServer.ini"), "PVP=true\n");

    const result = await templateService.captureServerConfig("server-1");
    expect(result.success).toBe(true);
    expect(result.config.mods).toEqual([]);
  });

  it("returns an error when the server doesn't exist", async () => {
    getServer.mockResolvedValue(null);
    const result = await templateService.captureServerConfig("missing");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
