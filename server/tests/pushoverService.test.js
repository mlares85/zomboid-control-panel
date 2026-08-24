import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();
vi.mock("https", () => {
  const request = (...args) => requestMock(...args);
  return { default: { request }, request };
});

const { PushoverService } = await import("../services/pushoverService.js");

function makeFakeRequest() {
  const req = new EventEmitter();
  req.write = vi.fn();
  req.end = vi.fn();
  return req;
}

function makeFakeResponse(statusCode, body) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  queueMicrotask(() => {
    res.emit("data", Buffer.from(body));
    res.emit("end");
  });
  return res;
}

function respondWith(statusCode, body) {
  const req = makeFakeRequest();
  requestMock.mockImplementation((options, callback) => {
    callback(makeFakeResponse(statusCode, body));
    return req;
  });
  return req;
}

beforeEach(() => {
  requestMock.mockReset();
});

describe("PushoverService.sendNotification", () => {
  it("fails fast without hitting the network when unconfigured", async () => {
    const service = new PushoverService({ userKey: "", apiToken: "" });
    const result = await service.sendNotification({ message: "hi" });
    expect(result.success).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("fails fast without a message", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const result = await service.sendNotification({});
    expect(result.success).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("posts form-encoded data to the Pushover messages endpoint", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    respondWith(200, JSON.stringify({ status: 1, request: "abc123" }));

    const result = await service.sendNotification({ title: "T", message: "hi", priority: 0 });

    expect(result).toEqual({ success: true, request: "abc123" });
    const [options] = requestMock.mock.calls[0];
    expect(options.hostname).toBe("api.pushover.net");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("includes the request body as form-encoded token/user/message", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const req = respondWith(200, JSON.stringify({ status: 1, request: "abc" }));

    await service.sendNotification({ title: "T", message: "hi" });

    const body = req.write.mock.calls[0][0];
    expect(body).toContain("token=t");
    expect(body).toContain("user=u");
    expect(body).toContain("message=hi");
    expect(body).toContain("title=T");
  });

  it("adds retry and expire params for priority 2 (emergency)", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const req = respondWith(200, JSON.stringify({ status: 1, request: "abc" }));

    await service.sendNotification({ message: "hi", priority: 2 });

    const body = req.write.mock.calls[0][0];
    expect(body).toContain("priority=2");
    expect(body).toContain("retry=");
    expect(body).toContain("expire=");
  });

  it("does not add retry/expire params for non-emergency priorities", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const req = respondWith(200, JSON.stringify({ status: 1, request: "abc" }));

    await service.sendNotification({ message: "hi", priority: 1 });

    const body = req.write.mock.calls[0][0];
    expect(body).not.toContain("retry=");
    expect(body).not.toContain("expire=");
  });

  it("passes sound through when provided", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const req = respondWith(200, JSON.stringify({ status: 1, request: "abc" }));

    await service.sendNotification({ message: "hi", sound: "siren" });

    expect(req.write.mock.calls[0][0]).toContain("sound=siren");
  });

  it("reports failure when Pushover responds with a non-1 status", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    respondWith(200, JSON.stringify({ status: 0, errors: ["invalid token"] }));

    const result = await service.sendNotification({ message: "hi" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid token");
  });

  it("reports failure on a non-200 HTTP status", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    respondWith(500, "Internal Server Error");

    const result = await service.sendNotification({ message: "hi" });

    expect(result.success).toBe(false);
  });

  it("reports failure when the response body is not valid JSON", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    respondWith(200, "not json");

    const result = await service.sendNotification({ message: "hi" });

    expect(result.success).toBe(false);
  });

  it("resolves {success:false} when the request itself errors", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const req = makeFakeRequest();
    requestMock.mockImplementation(() => req);

    const promise = service.sendNotification({ message: "hi" });
    req.emit("error", new Error("ECONNREFUSED"));

    const result = await promise;
    expect(result).toEqual({ success: false, error: "ECONNREFUSED" });
  });
});

describe("PushoverService.validateConfig", () => {
  it("sends a quiet (priority -2) test push", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "t" });
    const req = respondWith(200, JSON.stringify({ status: 1, request: "abc" }));

    const result = await service.validateConfig();

    expect(result.success).toBe(true);
    expect(req.write.mock.calls[0][0]).toContain("priority=-2");
  });

  it("surfaces failure when the token is invalid", async () => {
    const service = new PushoverService({ userKey: "u", apiToken: "bad" });
    respondWith(200, JSON.stringify({ status: 0, errors: ["application token is invalid"] }));

    const result = await service.validateConfig();

    expect(result.success).toBe(false);
  });
});
