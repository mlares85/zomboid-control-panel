import { describe, expect, it } from "vitest";
import { parseIniList } from "../utils/mods/iniFile.js";

describe("parseIniList", () => {
  it("splits a plain semicolon-delimited value", () => {
    expect(parseIniList("mod1;mod2;mod3")).toEqual(["mod1", "mod2", "mod3"]);
  });

  it("trims whitespace around entries and separators", () => {
    expect(parseIniList("mod1 ; mod2")).toEqual(["mod1", "mod2"]);
  });

  it("trims leading and trailing whitespace on the whole value", () => {
    expect(parseIniList(" 123 ; 456 ")).toEqual(["123", "456"]);
  });

  it("drops empty segments from trailing/doubled semicolons", () => {
    expect(parseIniList("mod1;;mod2;")).toEqual(["mod1", "mod2"]);
  });

  it("drops whitespace-only segments", () => {
    expect(parseIniList("mod1; ;mod2")).toEqual(["mod1", "mod2"]);
  });

  it("returns an empty array for undefined, null, or empty string", () => {
    expect(parseIniList(undefined)).toEqual([]);
    expect(parseIniList(null)).toEqual([]);
    expect(parseIniList("")).toEqual([]);
  });

  it("returns an empty array for a whitespace-only value", () => {
    expect(parseIniList("   ")).toEqual([]);
  });

  it("returns a single-entry array when there is no separator", () => {
    expect(parseIniList(" mod1 ")).toEqual(["mod1"]);
  });
});
