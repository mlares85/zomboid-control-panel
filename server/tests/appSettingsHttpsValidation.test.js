import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// PUT /app-settings used to accept httpsCertPath/httpsKeyPath/httpsPort as
// any string/number with zero validation, only ever checked at panel BOOT
// (utils/certs.js) — a bad value (directory instead of a file, missing
// path, colliding/out-of-range port) crashed the whole panel process on
// the NEXT restart, with no recovery path for a non-technical operator.
// This save-time gate rejects the bad value immediately instead.
const getAllSettings = vi.fn();
const getSetting = vi.fn();
const setSetting = vi.fn();

vi.mock("../database/init.js", () => ({
  getAllSettings,
  getSetting,
  setSetting,
}));

const { default: router } = await import("../routes/config.js");
const { findRouteLayer } = await import("./helpers/routerLayer.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getLayer(routePath, method) {
  return findRouteLayer(router.stack, routePath, method);
}

async function runRoute(routePath, method, req, res) {
  const layer = getLayer(routePath, method);
  const handlers = layer.route.stack.map((s) => s.handle);
  let idx = -1;
  const next = async (err) => {
    idx++;
    if (err) throw err;
    if (idx < handlers.length) await handlers[idx](req, res, next);
  };
  await next();
}

function makeApp(overrides = {}) {
  const values = { modChecker: null, serverManager: null, rconService: null, ...overrides };
  return { get: (key) => values[key] };
}

async function putSettings(settings) {
  const response = createResponse();
  await runRoute(
    "/app-settings",
    "put",
    { body: { settings }, user: { role: "admin" }, app: makeApp() },
    response,
  );
  return response;
}

describe("PUT /api/config/app-settings — HTTPS lockout prevention", () => {
  let dir;
  let validFile;

  beforeEach(() => {
    setSetting.mockReset();
    getSetting.mockReset();
    getSetting.mockResolvedValue(undefined);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pz-https-settings-"));
    validFile = path.join(dir, "cert.pem");
    fs.writeFileSync(validFile, "dummy cert contents");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(["httpsCertPath", "httpsKeyPath"])(
    "rejects a directory as %s instead of saving it",
    async (key) => {
      const response = await putSettings({ [key]: dir });
      expect(response.status).toHaveBeenCalledWith(400);
      expect(setSetting).not.toHaveBeenCalledWith(key, dir);
    },
  );

  it.each(["httpsCertPath", "httpsKeyPath"])(
    "rejects a %s that does not exist",
    async (key) => {
      const missing = path.join(dir, "does-not-exist.pem");
      const response = await putSettings({ [key]: missing });
      expect(response.status).toHaveBeenCalledWith(400);
      expect(setSetting).not.toHaveBeenCalledWith(key, missing);
    },
  );

  it.each(["httpsCertPath", "httpsKeyPath"])(
    "accepts an empty string for %s (clears the custom cert)",
    async (key) => {
      const response = await putSettings({ [key]: "" });
      expect(response.status).not.toHaveBeenCalledWith(400);
      expect(setSetting).toHaveBeenCalledWith(key, "");
    },
  );

  it.each(["httpsCertPath", "httpsKeyPath"])(
    "accepts an existing, readable file for %s",
    async (key) => {
      const response = await putSettings({ [key]: validFile });
      expect(response.status).not.toHaveBeenCalledWith(400);
      expect(setSetting).toHaveBeenCalledWith(key, validFile);
    },
  );

  it("rejects a non-integer httpsPort", async () => {
    const response = await putSettings({ httpsPort: "not-a-port" });
    expect(response.status).toHaveBeenCalledWith(400);
    expect(setSetting).not.toHaveBeenCalledWith("httpsPort", expect.anything());
  });

  it("rejects an out-of-range httpsPort", async () => {
    const response = await putSettings({ httpsPort: 70000 });
    expect(response.status).toHaveBeenCalledWith(400);
    expect(setSetting).not.toHaveBeenCalledWith("httpsPort", expect.anything());
  });

  it("rejects an httpsPort that collides with the panel's own HTTP port", async () => {
    getSetting.mockImplementation(async (key) => (key === "panelPort" ? 8080 : undefined));
    const response = await putSettings({ httpsPort: 8080 });
    expect(response.status).toHaveBeenCalledWith(400);
    expect(setSetting).not.toHaveBeenCalledWith("httpsPort", expect.anything());
  });

  it("accepts a valid, non-colliding httpsPort", async () => {
    getSetting.mockImplementation(async (key) => (key === "panelPort" ? 8080 : undefined));
    const response = await putSettings({ httpsPort: 8443 });
    expect(response.status).not.toHaveBeenCalledWith(400);
    expect(setSetting).toHaveBeenCalledWith("httpsPort", 8443);
  });
});
