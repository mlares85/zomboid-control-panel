import { describe, it, expect } from "vitest";
import { parseBoundedInteger } from "../utils/queryNumbers.js";

describe("mapProxy utilities", () => {
  describe("parseBoundedInteger", () => {
    it("parses valid integers within range", () => {
      expect(parseBoundedInteger("10", null, 0, 22)).toBe(10);
      expect(parseBoundedInteger("0", null, 0, 22)).toBe(0);
      expect(parseBoundedInteger("22", null, 0, 22)).toBe(22);
    });

    it("returns fallback for out-of-range values", () => {
      expect(parseBoundedInteger("23", null, 0, 22)).toBe(null);
      expect(parseBoundedInteger("-1", null, 0, 22)).toBe(null);
      expect(parseBoundedInteger("99", null, 0, 22)).toBe(null);
    });

    it("returns fallback for non-numeric strings", () => {
      expect(parseBoundedInteger("abc", null, 0, 22)).toBe(null);
      expect(parseBoundedInteger("", null, 0, 22)).toBe(null);
      expect(parseBoundedInteger("10.5", null, 0, 22)).toBe(null);
    });

    it("handles negative ranges", () => {
      expect(parseBoundedInteger("-5", null, -17, 29)).toBe(-5);
      expect(parseBoundedInteger("-17", null, -17, 29)).toBe(-17);
      expect(parseBoundedInteger("-18", null, -17, 29)).toBe(null);
    });
  });

  describe("tile URL construction", () => {
    // Verify the new URL format has no /maps/ prefix
    const PZ_TILES_ROOT = "https://tiles.pzmap.org";
    const directory = "42.20.0";

    it("builds correct B42 tile URL without /maps/ prefix", () => {
      const url = `${PZ_TILES_ROOT}/${directory}/base/layer0_files/15/9_3.jpg`;
      expect(url).toBe("https://tiles.pzmap.org/42.20.0/base/layer0_files/15/9_3.jpg");
      expect(url).not.toContain("/maps/");
    });

    it("builds correct floor tile URL", () => {
      const floor = -3;
      const url = `${PZ_TILES_ROOT}/${directory}/base/layer${floor}_files/10/5_2.jpg`;
      expect(url).toBe("https://tiles.pzmap.org/42.20.0/base/layer-3_files/10/5_2.jpg");
    });

    it("builds correct B41 tile URL", () => {
      const url = `${PZ_TILES_ROOT}/41.78.16/base/layer0_files/12/4_2.jpg`;
      expect(url).toBe("https://tiles.pzmap.org/41.78.16/base/layer0_files/12/4_2.jpg");
    });

    it("builds correct top-down tile URL", () => {
      const url = `${PZ_TILES_ROOT}/${directory}/base_top/layer0_files/10/5_2.jpg`;
      expect(url).toBe("https://tiles.pzmap.org/42.20.0/base_top/layer0_files/10/5_2.jpg");
    });
  });
});
