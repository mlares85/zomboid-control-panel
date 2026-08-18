import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { LocalFiles } from "../services/fileAccess/index.js";

const getActiveServer = vi.fn();
const updateServer = vi.fn();

vi.mock("../database/init.js", () => ({
  getActiveServer,
  updateServer,
}));

vi.mock("../routes/serverFiles/context.js", () => ({
  getServerConfigPath: vi.fn(async () => configPath),
  getServerName: vi.fn(async () => "servertest"),
  createBackup: vi.fn(async () => null),
}));

let templatesPath;
let configPath;

vi.mock("../routes/serverFiles/templates.js", () => ({
  getTemplatesPath: vi.fn(async () => templatesPath),
}));

const { default: router } = await import("../routes/serverFiles/templateActions.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getHandler(routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

let root;

beforeEach(() => {
  getActiveServer.mockReset();
  updateServer.mockReset();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pz-template-actions-"));
  templatesPath = path.join(root, "templates");
  configPath = path.join(root, "Server");
  fs.mkdirSync(templatesPath, { recursive: true });
  fs.mkdirSync(configPath, { recursive: true });
  fs.writeFileSync(
    path.join(templatesPath, "hardcore-survivor.json"),
    JSON.stringify({ name: "Hardcore Survivor", iniRaw: "MaxPlayers=8" }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("POST /templates/:id/apply", () => {
  it("records the applied template on the active server", async () => {
    getActiveServer.mockResolvedValue({ id: "server-1" });
    const req = {
      params: { id: "hardcore-survivor" },
      body: {},
      fileAccess: new LocalFiles(),
    };
    const res = createResponse();

    await getHandler("/templates/:id/apply", "post")(req, res);

    expect(updateServer).toHaveBeenCalledWith("server-1", {
      lastAppliedTemplateId: "hardcore-survivor",
      lastAppliedTemplateName: "Hardcore Survivor",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("skips recording when there is no active server", async () => {
    getActiveServer.mockResolvedValue(null);
    const req = {
      params: { id: "hardcore-survivor" },
      body: {},
      fileAccess: new LocalFiles(),
    };
    const res = createResponse();

    await getHandler("/templates/:id/apply", "post")(req, res);

    expect(updateServer).not.toHaveBeenCalled();
  });
});
