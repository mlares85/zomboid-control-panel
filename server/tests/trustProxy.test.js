import { describe, expect, it } from "vitest";
import { parseTrustProxySetting } from "../utils/trustProxy.js";

describe("parseTrustProxySetting", () => {
  it.each(["", "0", "false", "off", "none", "FALSE", "OFF", null, undefined])(
    "returns false for disabled value: %s",
    (value) => expect(parseTrustProxySetting(value)).toBe(false),
  );

  it('returns 1 for "true"', () => {
    expect(parseTrustProxySetting("true")).toBe(1);
    expect(parseTrustProxySetting("TRUE")).toBe(1);
  });

  it("returns a numeric hop count for integer strings", () => {
    expect(parseTrustProxySetting("1")).toBe(1);
    expect(parseTrustProxySetting("3")).toBe(3);
  });

  it("returns false for zero or negative hop counts", () => {
    expect(parseTrustProxySetting("-1")).toBe(false);
  });

  it("returns a single IP/subnet as a string", () => {
    expect(parseTrustProxySetting("10.0.0.0/8")).toBe("10.0.0.0/8");
  });

  it("returns a comma-separated list as an array", () => {
    expect(parseTrustProxySetting("10.0.0.0/8, 172.16.0.0/12")).toEqual([
      "10.0.0.0/8",
      "172.16.0.0/12",
    ]);
  });
});
