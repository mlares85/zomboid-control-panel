import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";

import {
  getConfiguredIpv4Address,
  listNetworkInterfaces,
  getLocalIp,
  fetchPublicIp,
} from "../services/serverNetwork.js";

describe("getConfiguredIpv4Address", () => {
  const VAR = "TEST_PANEL_IP";
  const originalValue = process.env[VAR];

  afterEach(() => {
    if (originalValue === undefined) delete process.env[VAR];
    else process.env[VAR] = originalValue;
  });

  it("returns the address when it is a valid IPv4 address", () => {
    process.env[VAR] = "192.168.1.50";
    expect(getConfiguredIpv4Address(VAR)).toBe("192.168.1.50");
  });

  it("trims surrounding whitespace before validating", () => {
    process.env[VAR] = "  10.0.0.5  ";
    expect(getConfiguredIpv4Address(VAR)).toBe("10.0.0.5");
  });

  it("returns null when the variable is unset", () => {
    delete process.env[VAR];
    expect(getConfiguredIpv4Address(VAR)).toBeNull();
  });

  it("returns null when the value is not a valid IP at all", () => {
    process.env[VAR] = "not-an-ip";
    expect(getConfiguredIpv4Address(VAR)).toBeNull();
  });

  it("returns null when the value is an IPv6 address", () => {
    process.env[VAR] = "::1";
    expect(getConfiguredIpv4Address(VAR)).toBeNull();
  });
});

describe("listNetworkInterfaces", () => {
  let spy;

  afterEach(() => {
    spy?.mockRestore();
  });

  it("returns only non-internal IPv4 interfaces", () => {
    spy = vi.spyOn(os, "networkInterfaces").mockReturnValue({
      lo0: [
        { family: "IPv4", internal: true, address: "127.0.0.1" },
      ],
      eth0: [
        { family: "IPv4", internal: false, address: "192.168.1.10" },
        { family: "IPv6", internal: false, address: "fe80::1" },
      ],
      tailscale0: [
        { family: "IPv4", internal: false, address: "100.64.0.5" },
      ],
    });

    expect(listNetworkInterfaces()).toEqual([
      { name: "eth0", address: "192.168.1.10" },
      { name: "tailscale0", address: "100.64.0.5" },
    ]);
  });

  it("returns an empty array when there are no external IPv4 interfaces", () => {
    spy = vi.spyOn(os, "networkInterfaces").mockReturnValue({
      lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    });

    expect(listNetworkInterfaces()).toEqual([]);
  });
});

describe("getLocalIp", () => {
  let spy;
  const LAN_VAR = "PANEL_LAN_IP";
  const originalLanEnv = process.env[LAN_VAR];

  beforeEach(() => {
    spy = vi.spyOn(os, "networkInterfaces").mockReturnValue({
      eth0: [{ family: "IPv4", internal: false, address: "192.168.1.10" }],
      tailscale0: [{ family: "IPv4", internal: false, address: "100.64.0.5" }],
    });
  });

  afterEach(() => {
    spy.mockRestore();
    if (originalLanEnv === undefined) delete process.env[LAN_VAR];
    else process.env[LAN_VAR] = originalLanEnv;
  });

  it("prefers the user-selected lanIpAddress setting when it matches a live interface", async () => {
    const getSetting = vi.fn(async (key) =>
      key === "lanIpAddress" ? "100.64.0.5" : null,
    );

    expect(await getLocalIp(getSetting)).toBe("100.64.0.5");
  });

  it("ignores a selected setting that no longer matches any interface", async () => {
    delete process.env[LAN_VAR];
    const getSetting = vi.fn(async (key) =>
      key === "lanIpAddress" ? "10.9.9.9" : null,
    );

    expect(await getLocalIp(getSetting)).toBe("192.168.1.10");
  });

  it("falls back to PANEL_LAN_IP when no setting is selected", async () => {
    process.env[LAN_VAR] = "192.168.1.10";
    const getSetting = vi.fn(async () => null);

    expect(await getLocalIp(getSetting)).toBe("192.168.1.10");
  });

  it("falls back to the first detected interface when getSetting throws", async () => {
    delete process.env[LAN_VAR];
    const getSetting = vi.fn(async () => {
      throw new Error("db unavailable");
    });

    expect(await getLocalIp(getSetting)).toBe("192.168.1.10");
  });

  it("falls back to 127.0.0.1 when no interfaces are detected", async () => {
    spy.mockReturnValue({});
    delete process.env[LAN_VAR];
    const getSetting = vi.fn(async () => null);

    expect(await getLocalIp(getSetting)).toBe("127.0.0.1");
  });
});

describe("fetchPublicIp", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the IP and caches it via setSetting on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ip: "203.0.113.5" }),
    });
    const setSetting = vi.fn().mockResolvedValue(undefined);

    const ip = await fetchPublicIp(setSetting);

    expect(ip).toBe("203.0.113.5");
    expect(setSetting).toHaveBeenCalledWith("cachedPublicIp", "203.0.113.5");
    expect(setSetting).toHaveBeenCalledWith(
      "cachedPublicIpAt",
      expect.any(String),
    );
  });

  it("returns null when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const setSetting = vi.fn();

    expect(await fetchPublicIp(setSetting)).toBeNull();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("returns null when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const setSetting = vi.fn();

    expect(await fetchPublicIp(setSetting)).toBeNull();
  });

  it("still returns the IP even if caching it fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ip: "203.0.113.9" }),
    });
    const setSetting = vi.fn().mockRejectedValue(new Error("db locked"));

    expect(await fetchPublicIp(setSetting)).toBe("203.0.113.9");
  });
});
