import { describe, expect, it, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildLaunchConfig,
  buildLdLibraryPath,
} from "../services/launchConfigBuilder.js";

const isWindows = process.platform === "win32";

describe("launchConfigBuilder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildLaunchConfig — custom command", () => {
    it("returns an error for disallowed shell characters", () => {
      const { config, error } = buildLaunchConfig({
        startCommand: "start.sh && rm -rf /",
        serverPath: "/srv/pz",
      });
      expect(config).toBeUndefined();
      expect(error).toMatch(/disallowed shell characters/);
    });

    it("returns an error when the command file does not exist", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const ext = isWindows ? "start.exe" : "start.sh";
      const { config, error } = buildLaunchConfig({
        startCommand: ext,
        serverPath: "/srv/pz",
      });
      expect(config).toBeUndefined();
      expect(error).toMatch(/not found/);
    });

    it("returns an error for a disallowed extension", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const { config, error } = buildLaunchConfig({
        startCommand: "start.ps1",
        serverPath: "/srv/pz",
      });
      expect(config).toBeUndefined();
      expect(error).toMatch(/disallowed extension/);
    });

    it.skipIf(isWindows)(
      "resolves a valid .sh custom command with bash + LD_LIBRARY_PATH on non-Windows",
      () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
        const { config, error } = buildLaunchConfig({
          startCommand: "custom-start.sh --extra-arg",
          serverPath: "/srv/pz",
        });
        expect(error).toBeUndefined();
        expect(config.command).toBe("bash");
        expect(config.args[0]).toBe(
          path.resolve("/srv/pz", "custom-start.sh"),
        );
        expect(config.args).toContain("--extra-arg");
        expect(config.cwd).toBe("/srv/pz");
        expect(config.env).toHaveProperty("LD_LIBRARY_PATH");
      },
    );

    it.skipIf(!isWindows)(
      "resolves a valid .bat custom command with cmd.exe wrapping on Windows",
      () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        const { config, error } = buildLaunchConfig({
          startCommand: "custom-start.bat --extra-arg",
          serverPath: "C:\\pz",
        });
        expect(error).toBeUndefined();
        expect(config.command).toBe("cmd.exe");
        expect(config.args[0]).toBe("/c");
        expect(config.args).toContain("--extra-arg");
      },
    );
  });

  describe("buildLaunchConfig — default startup script", () => {
    it("returns an error when the startup script is missing", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const { config, error } = buildLaunchConfig({
        startCommand: "",
        serverPath: "/srv/pz",
        serverBat: "start-server.sh",
      });
      expect(config).toBeUndefined();
      expect(error).toMatch(/Server startup script not found/);
    });

    it.skipIf(isWindows)(
      "wraps the .sh default script with bash and sets LD_LIBRARY_PATH on non-Windows",
      () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
        const { config, error } = buildLaunchConfig({
          startCommand: "",
          serverPath: "/srv/pz",
          serverBat: "start-server.sh",
        });
        expect(error).toBeUndefined();
        expect(config.command).toBe("bash");
        expect(config.args).toEqual(["start-server.sh"]);
        expect(config.cwd).toBe("/srv/pz");
        expect(config.env).toHaveProperty("LD_LIBRARY_PATH");
      },
    );

    it.skipIf(!isWindows)(
      "wraps the .bat default script with cmd.exe on Windows",
      () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        const { config, error } = buildLaunchConfig({
          startCommand: "",
          serverPath: "C:\\pz",
          serverBat: "StartServer64.bat",
        });
        expect(error).toBeUndefined();
        expect(config.command).toBe("cmd.exe");
        expect(config.args).toEqual(["/c", "StartServer64.bat"]);
        expect(config.cwd).toBe("C:\\pz");
      },
    );
  });

  describe("buildLdLibraryPath", () => {
    it("filters candidate directories to only those that exist", () => {
      vi.spyOn(fs, "existsSync").mockImplementation(
        (p) => String(p).endsWith("linux64") || String(p).endsWith("natives"),
      );
      const result = buildLdLibraryPath("/srv/pz");
      expect(result).toContain(path.join("/srv/pz", "linux64"));
      expect(result).toContain(path.join("/srv/pz", "natives"));
      expect(result).not.toContain(path.join("/srv/pz", "jre64"));
    });

    it("returns just the extra LD_LIBRARY_PATH env when nothing exists", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const original = process.env.LD_LIBRARY_PATH;
      process.env.LD_LIBRARY_PATH = "/opt/extra-libs";
      const result = buildLdLibraryPath("/srv/pz");
      expect(result).toBe("/opt/extra-libs");
      if (original === undefined) delete process.env.LD_LIBRARY_PATH;
      else process.env.LD_LIBRARY_PATH = original;
    });
  });
});
