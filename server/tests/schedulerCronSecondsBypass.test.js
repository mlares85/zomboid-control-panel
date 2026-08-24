import { beforeEach, describe, expect, it, vi } from "vitest";

// isCronTooFrequent()'s "Security: Reject tasks that run more frequently
// than every 5 minutes to prevent DoS" guard always read parts[0] as
// MINUTES. node-cron accepts an optional leading SECONDS field (6 fields
// total) that this app has never documented, tested, or exposed a
// legitimate use for -- for a 6-field expression parts[0] is actually
// seconds, so "*/5 * * * * *" (fires every 5 SECONDS) read as
// minute="*/5", which looks like an ordinary once-every-5-minutes value
// and sailed through untouched.
//
// Fix: a new exact-arity check (hasUnsupportedCronFieldCount) applied
// before isCronTooFrequent at every entry point -- POST /tasks, PUT
// /tasks/:id, POST /validate-cron. isCronTooFrequent's own arity floor
// becomes an exact match and fails closed (too-frequent) on anything
// else, as defense-in-depth for any future caller that skips the
// dedicated gate.

const ROLES = {
  automation_only: { name: "automation_only", capabilities: ["automation.manage"] },
};

vi.mock("../database/init.js", () => ({
  getScheduledTasks: vi.fn(),
  createScheduledTask: vi.fn(),
  updateScheduledTask: vi.fn(),
  deleteScheduledTask: vi.fn(),
  getServer: vi.fn(),
  getActiveServer: vi.fn().mockResolvedValue(null),
  getRoleByName: vi.fn((name) => Promise.resolve(ROLES[name] || null)),
}));

const { createScheduledTask, updateScheduledTask } = await import("../database/init.js");
const { isCronTooFrequent } = await import("../routes/scheduler/cronHelpers.js");
const { hasUnsupportedCronFieldCount } = await import("../routes/scheduler/cronHelpers.js");
const { default: router } = await import("../routes/scheduler/index.js");

// Routes may live directly on `router` or be nested under sub-routers,
// so this walks the stack recursively (mirrors schedulerRunTask.test.js).
function findLayer(stack, path, method) {
  for (const entry of stack) {
    if (entry.route?.path === path && entry.route.methods[method]) {
      return entry.route.stack[0].handle;
    }
    if (entry.name === "router" && entry.handle?.stack) {
      const found = findLayer(entry.handle.stack, path, method);
      if (found) return found;
    }
  }
  return null;
}

function getHandler(routePath, method) {
  const handler = findLayer(router.stack, routePath, method);
  if (!handler) throw new Error(`No ${method.toUpperCase()} ${routePath} route registered`);
  return handler;
}

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function baseReq(overrides = {}) {
  return {
    user: { role: "automation_only" },
    app: { get: () => ({ scheduleTask: vi.fn(), cancelTask: vi.fn() }) },
    ...overrides,
  };
}

describe("hasUnsupportedCronFieldCount() -- exact arity, not a floor", () => {
  it("accepts exactly 5 fields", () => {
    expect(hasUnsupportedCronFieldCount("0 */6 * * *")).toBe(false);
  });
  it("rejects 6 fields (seconds-precision)", () => {
    expect(hasUnsupportedCronFieldCount("*/5 * * * * *")).toBe(true);
  });
  it("rejects 4 fields", () => {
    expect(hasUnsupportedCronFieldCount("* * * *")).toBe(true);
  });
  it("tolerates extra whitespace between fields without miscounting", () => {
    expect(hasUnsupportedCronFieldCount("0   */6  *  *   *")).toBe(false);
  });
});

describe("isCronTooFrequent() -- arity floor is now an exact match, fails closed", () => {
  it("treats a 6-field expression as too-frequent (defense-in-depth)", () => {
    expect(isCronTooFrequent("*/5 * * * * *")).toBe(true);
  });
  it("treats a 4-field expression as too-frequent (defense-in-depth)", () => {
    expect(isCronTooFrequent("* * * *")).toBe(true);
  });
  it("still evaluates a valid 5-field expression normally", () => {
    expect(isCronTooFrequent("0 */6 * * *")).toBe(false);
    expect(isCronTooFrequent("* * * * *")).toBe(true);
  });
});

describe("POST /api/scheduler/tasks -- seconds-precision cron rejection", () => {
  beforeEach(() => {
    createScheduledTask.mockReset();
  });

  it("refuses the exact live bypass string ('*/5 * * * * *', fires every 5 seconds) that previously sailed through", async () => {
    const response = createResponse();
    await getHandler("/tasks", "post")(
      baseReq({
        body: { name: "x", cronExpression: "*/5 * * * * *", command: "restart" },
      }),
      response,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/seconds-precision/i) }),
    );
    expect(createScheduledTask).not.toHaveBeenCalled();
  });

  it("still refuses '* * * * * *' (every second) -- the case that was already caught by accident, now caught for the right reason", async () => {
    const response = createResponse();
    await getHandler("/tasks", "post")(
      baseReq({
        body: { name: "x", cronExpression: "* * * * * *", command: "restart" },
      }),
      response,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(createScheduledTask).not.toHaveBeenCalled();
  });

  it("does not regress: a genuinely too-frequent 5-field expression is still refused with the original message", async () => {
    const response = createResponse();
    await getHandler("/tasks", "post")(
      baseReq({
        body: { name: "x", cronExpression: "* * * * *", command: "restart" },
      }),
      response,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Tasks cannot run more frequently than every 5 minutes" }),
    );
    expect(createScheduledTask).not.toHaveBeenCalled();
  });

  it("does not regress: a valid 5-field, not-too-frequent expression still creates the task", async () => {
    createScheduledTask.mockResolvedValue({ id: 99 });
    const response = createResponse();
    await getHandler("/tasks", "post")(
      baseReq({
        body: { name: "x", cronExpression: "0 */6 * * *", command: "restart" },
      }),
      response,
    );
    expect(createScheduledTask).toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalledWith(400);
  });
});

describe("PUT /api/scheduler/tasks/:id -- seconds-precision cron rejection", () => {
  beforeEach(() => {
    updateScheduledTask.mockReset();
  });

  it("refuses the exact live bypass string on update too", async () => {
    const response = createResponse();
    await getHandler("/tasks/:id", "put")(
      baseReq({
        params: { id: "1" },
        body: { cronExpression: "*/30 * * * * *" },
      }),
      response,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/seconds-precision/i) }),
    );
    expect(updateScheduledTask).not.toHaveBeenCalled();
  });

  it("does not regress: a valid 5-field expression still updates", async () => {
    updateScheduledTask.mockResolvedValue({ id: 1, name: "x", cron_expression: "0 0 * * *", command: "restart", server_id: null });
    const response = createResponse();
    await getHandler("/tasks/:id", "put")(
      baseReq({
        params: { id: "1" },
        body: { cronExpression: "0 0 * * *" },
      }),
      response,
    );
    expect(updateScheduledTask).toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalledWith(400);
  });
});

describe("POST /api/scheduler/validate-cron -- preview stays consistent with what create/update will accept", () => {
  it("previews a 6-field expression as invalid, not valid, so the UI doesn't show success right before a real submit is refused", async () => {
    const response = createResponse();
    await getHandler("/validate-cron", "post")(
      baseReq({ body: { cronExpression: "*/5 * * * * *" } }),
      response,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ valid: false, error: expect.stringMatching(/seconds-precision/i) }),
    );
  });

  it("still previews a valid 5-field expression as valid", async () => {
    const response = createResponse();
    await getHandler("/validate-cron", "post")(
      baseReq({ body: { cronExpression: "0 */6 * * *" } }),
      response,
    );
    expect(response.json).toHaveBeenCalledWith({ valid: true });
  });
});
