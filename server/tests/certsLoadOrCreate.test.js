import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { loadOrCreateCerts } from "../utils/certs.js";

// Save-time validation (see appSettingsHttpsValidation.test.js) blocks a
// bad httpsCertPath/httpsKeyPath from ever being SAVED, but a path that was
// a valid file when saved can still be moved/deleted/permission-changed
// before the panel next restarts. loadOrCreateCerts() must degrade to
// self-signed on any such problem instead of throwing — a throw here
// crashes the entire process via index.js's global uncaughtException
// handler, not just HTTPS.
describe("loadOrCreateCerts — a bad custom cert path degrades instead of crashing", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pz-certs-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to self-signed instead of throwing when the custom path is a directory (EISDIR)", () => {
    expect(() => loadOrCreateCerts(dir, dir)).not.toThrow();
    const result = loadOrCreateCerts(dir, dir);
    expect(result).toBeTruthy();
    expect(result.key).toBeInstanceOf(Buffer);
    expect(result.cert).toBeInstanceOf(Buffer);
  });

  it("falls back to self-signed instead of throwing when the custom path does not exist", () => {
    const missing = path.join(dir, "does-not-exist.key");
    expect(() => loadOrCreateCerts(missing, missing)).not.toThrow();
  });

  it("still uses a genuinely valid custom key/cert pair", () => {
    const keyPath = path.join(dir, "custom.key");
    const certPath = path.join(dir, "custom.cert");
    fs.writeFileSync(keyPath, "fake-key-contents");
    fs.writeFileSync(certPath, "fake-cert-contents");

    const result = loadOrCreateCerts(keyPath, certPath);
    expect(result.key.toString()).toBe("fake-key-contents");
    expect(result.cert.toString()).toBe("fake-cert-contents");
  });
});
