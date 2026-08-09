import { beforeEach, describe, expect, it, vi } from "vitest";

const listRecords = vi.fn();
const getRecord = vi.fn();
const updateRecord = vi.fn();
const listBackupServers = vi.fn();

vi.mock("../services/backupRecords.js", () => ({
  listRecords,
  getRecord,
  updateRecord,
  listBackupServers,
}));

vi.mock("../utils/backupCompression.js", () => ({
  computeChecksum: vi.fn(),
  verifyArchive: vi.fn(),
}));

const { default: router } = await import("../routes/backupRecordsRoute.js");

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function getHandler(routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

beforeEach(() => {
  listRecords.mockReset();
  getRecord.mockReset();
  updateRecord.mockReset();
  listBackupServers.mockReset();
});

describe("GET /records", () => {
  it("passes serverId/serverName query filters through to listRecords", async () => {
    listRecords.mockResolvedValue([{ id: "a" }]);
    const req = { query: { serverId: "srv-1", serverName: "alpha", limit: "5" } };
    const res = createResponse();

    await getHandler("/records", "get")(req, res);

    expect(listRecords).toHaveBeenCalledWith({ limit: 5, serverId: "srv-1", serverName: "alpha" });
    expect(res.json).toHaveBeenCalledWith({ records: [{ id: "a" }] });
  });
});

describe("GET /records/:id", () => {
  it("returns the full record including its serverSnapshot", async () => {
    const record = { id: "abc", serverSnapshot: { serverName: "servertest" } };
    getRecord.mockResolvedValue(record);
    const req = { params: { id: "abc" } };
    const res = createResponse();

    await getHandler("/records/:id", "get")(req, res);

    expect(res.json).toHaveBeenCalledWith({ record });
  });

  it("404s when the record does not exist", async () => {
    getRecord.mockResolvedValue(null);
    const req = { params: { id: "missing" } };
    const res = createResponse();

    await getHandler("/records/:id", "get")(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("GET /servers", () => {
  it("returns the servers list for the filter dropdown", async () => {
    const servers = [{ serverId: "srv-1", serverName: "alpha", backupCount: 2 }];
    listBackupServers.mockResolvedValue(servers);
    const res = createResponse();

    await getHandler("/servers", "get")({}, res);

    expect(res.json).toHaveBeenCalledWith({ servers });
  });
});
