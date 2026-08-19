import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      accessSync: vi.fn(() => { throw new Error("EACCES"); }),
    },
    existsSync: vi.fn(() => false),
    accessSync: vi.fn(() => { throw new Error("EACCES"); }),
  };
});

import fs from "fs";
import {
  detectSteamCmd,
  detectPzInstalls,
  suggestInstallPath,
  detectSetupEnvironment,
} from "../services/installer/detectInstall.js";

describe("detectInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.accessSync.mockImplementation(() => { throw new Error("EACCES"); });
  });

  describe("detectSteamCmd", () => {
    it("returns found:false when no SteamCMD exists", () => {
      const result = detectSteamCmd();
      expect(result.found).toBe(false);
    });

    it("detects SteamCMD at a known path", () => {
      fs.existsSync.mockImplementation((p) =>
        typeof p === "string" && p.includes("/opt/steamcmd/steamcmd.sh"),
      );

      const result = detectSteamCmd();
      expect(result.found).toBe(true);
      expect(result.path).toBe("/opt/steamcmd");
    });

    it("detects system-wide steamcmd binary", () => {
      fs.existsSync.mockImplementation((p) =>
        p === "/usr/games/steamcmd",
      );

      const result = detectSteamCmd();
      expect(result.found).toBe(true);
      expect(result.exe).toBe("/usr/games/steamcmd");
    });
  });

  describe("detectPzInstalls", () => {
    it("returns empty array when no installs found", () => {
      const result = detectPzInstalls();
      expect(result).toEqual([]);
    });

    it("detects PZ server at a known path", () => {
      fs.existsSync.mockImplementation((p) =>
        typeof p === "string" && (
          p === "/opt/pz-server" ||
          p.includes("/opt/pz-server/start-server.sh")
        ),
      );

      const result = detectPzInstalls();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].signatures).toContain("start-server.sh");
    });

    it("deduplicates paths", () => {
      // Even if multiple candidates resolve to the same path,
      // it should only appear once
      fs.existsSync.mockImplementation((p) =>
        typeof p === "string" && p.includes("start-server.sh"),
      );

      const result = detectPzInstalls();
      const paths = result.map((r) => r.path);
      const unique = [...new Set(paths)];
      expect(paths.length).toBe(unique.length);
    });
  });

  describe("suggestInstallPath", () => {
    it("returns a string path", () => {
      const result = suggestInstallPath();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("prefers writable paths", () => {
      fs.accessSync.mockImplementation((p) => {
        if (typeof p === "string" && p === "/opt") return;
        throw new Error("EACCES");
      });

      const result = suggestInstallPath();
      expect(result).toBe("/opt/pz-server");
    });
  });

  describe("detectSetupEnvironment", () => {
    it("returns all fields", () => {
      const result = detectSetupEnvironment();
      expect(result).toHaveProperty("steamCmd");
      expect(result).toHaveProperty("existingInstalls");
      expect(result).toHaveProperty("suggestedInstallPath");
      expect(result).toHaveProperty("platform");
    });

    it("platform matches process.platform", () => {
      const result = detectSetupEnvironment();
      expect(result.platform).toBe(process.platform);
    });
  });
});
