import { describe, it, expect, vi } from "vitest";

// rcon.js's execute() calls logCommand()/getSetting()/getActiveServer()/
// getServer() from the database layer -- stub them so this test exercises
// the real RconService.execute() (not a spy on execute() itself, which
// would bypass the exact code path being fixed) without touching lowdb.
vi.mock("../database/init.js", () => ({
  logCommand: vi.fn(),
  getSetting: vi.fn(),
  getActiveServer: vi.fn(),
  getServer: vi.fn(),
}));

const { RconService, classifyRconResponse } = await import(
  "../services/rcon.js"
);

// Response texts confirmed against PZ's decompiled B42 server jar
// (zombie/network/BanSystem.class, zombie/network/ServerWorldDatabase.class)
// -- banuser/unbanuser/adduser/removeuserfromwhitelist delegate their entire
// result string to these two classes, so their own command classes carry no
// rejection text at all and a real failure used to come back as {success:true}.
describe("classifyRconResponse — BanSystem/ServerWorldDatabase rejections", () => {
  it.each([
    ["This user can't be banned.", /can't be banned/],
    ["A user with this name already exists.", /already exists/],
    [
      'User "Bob" is not in the whitelist, use /adduser first',
      /not in the whitelist/,
    ],
    ["User Bob not found", /not found/],
    [
      "You don't have capability to ban/unban users.",
      /capability to ban\/unban/,
    ],
    [
      "Cannot ban IP 1.2.3.4 (Steam Relay shared address). Use bansteamid or banuser instead.",
      /Steam Relay/,
    ],
    [
      "Cannot ban IP for player 'Bob' (Steam Relay, real IP unavailable). Use bansteamid or banuser without -ip.",
      /Steam Relay/,
    ],
  ])("flags %j as a rejection", (response, expectedMessage) => {
    const result = classifyRconResponse(response);
    expect(result).not.toBeNull();
    expect(result.message).toMatch(expectedMessage);
  });

  it("does not misclassify a plausible success response", () => {
    expect(classifyRconResponse("User Bob added to whitelist.")).toBeNull();
  });

  it("does not misclassify when a player's own name contains a rejection fragment", () => {
    // A player literally named "not found" being banned successfully must
    // not be misread as the "User ... not found" rejection.
    expect(classifyRconResponse('User "not found" banned.')).toBeNull();
  });

  it("still recognizes an unrelated command as unknown (pre-existing behavior)", () => {
    const result = classifyRconResponse("Unknown command 'foo'");
    expect(result).not.toBeNull();
    expect(result.message).toMatch(/not available on this server build/);
  });
});

describe("RconService.execute() surfaces ban/whitelist rejections as failures", () => {
  const connectedRcon = (response) => {
    const rcon = new RconService();
    rcon.connected = true;
    rcon.client = { execute: vi.fn().mockResolvedValue(response) };
    return rcon;
  };

  it("banPlayer reports failure when BanSystem rejects a protected account", async () => {
    const rcon = connectedRcon("This user can't be banned.");
    const result = await rcon.banPlayer("AdminBob");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/can't be banned/);
  });

  it("addUser reports failure when ServerWorldDatabase says the user already exists", async () => {
    const rcon = connectedRcon("A user with this name already exists.");
    const result = await rcon.addUser("Bob", "pw");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists/);
  });

  it("unbanPlayer reports failure when the target was never whitelisted", async () => {
    const rcon = connectedRcon(
      'User "Bob" is not in the whitelist, use /adduser first',
    );
    const result = await rcon.unbanPlayer("Bob");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not in the whitelist/);
  });

  it("removeFromWhitelist reports failure on a not-found response", async () => {
    const rcon = connectedRcon("User Bob not found");
    const result = await rcon.removeFromWhitelist("Bob");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it("banPlayer still reports success on a genuine, non-matching response", async () => {
    const rcon = connectedRcon('User "Bob" banned.');
    const result = await rcon.banPlayer("Bob");
    expect(result.success).toBe(true);
  });
});
