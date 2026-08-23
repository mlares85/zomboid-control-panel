import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerLogStreamer } from "../services/containerLogStreamer.js";

// Fake Socket.IO server with room tracking
function fakeIo() {
  const rooms = new Map();
  return {
    to: vi.fn(() => ({ emit: vi.fn() })),
    sockets: {
      adapter: { rooms },
    },
    _addToRoom(room, socketId) {
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(socketId);
    },
    _removeFromRoom(room, socketId) {
      const r = rooms.get(room);
      if (r) { r.delete(socketId); if (r.size === 0) rooms.delete(room); }
    },
  };
}

function fakeSocket(id = "s1") {
  let joinedRoom = null;
  return {
    id,
    join(room) { joinedRoom = room; },
    leave(room) { if (joinedRoom === room) joinedRoom = null; },
    get _room() { return joinedRoom; },
  };
}

function fakeDockerClient({ available = true, containerId = "ctr-abc" } = {}) {
  const cancelFn = vi.fn();
  return {
    available,
    streamContainerLogs: vi.fn(() => cancelFn),
    _cancelFn: cancelFn,
  };
}

// Mock getActiveServer
vi.mock("../database/init.js", () => ({
  getActiveServer: vi.fn(async () => ({
    id: "srv1",
    provider: "docker-managed",
    dockerContainerId: "ctr-abc",
    dockerContainerName: "zomboid-test",
  })),
}));

describe("ContainerLogStreamer", () => {
  let io, docker, streamer;

  beforeEach(() => {
    io = fakeIo();
    docker = fakeDockerClient();
    streamer = new ContainerLogStreamer(io, docker);
  });

  it("starts streaming on subscribe", async () => {
    const socket = fakeSocket();
    io._addToRoom("container:logs", socket.id);

    await streamer.subscribe(socket);

    expect(docker.streamContainerLogs).toHaveBeenCalledWith(
      "ctr-abc",
      expect.any(Function),
      { tail: 0 },
    );
  });

  it("stops streaming when last subscriber leaves", async () => {
    const socket = fakeSocket();
    io._addToRoom("container:logs", socket.id);
    await streamer.subscribe(socket);

    // Remove from room to simulate leave
    io._removeFromRoom("container:logs", socket.id);
    streamer.unsubscribe(socket);

    // Wait for the setTimeout in unsubscribe
    await new Promise((r) => setTimeout(r, 150));

    expect(docker._cancelFn).toHaveBeenCalled();
  });

  it("does not stop streaming if other subscribers remain", async () => {
    const s1 = fakeSocket("s1");
    const s2 = fakeSocket("s2");
    io._addToRoom("container:logs", s1.id);
    io._addToRoom("container:logs", s2.id);

    await streamer.subscribe(s1);
    await streamer.subscribe(s2);

    // Remove s1 but s2 remains
    io._removeFromRoom("container:logs", s1.id);
    streamer.unsubscribe(s1);
    await new Promise((r) => setTimeout(r, 150));

    expect(docker._cancelFn).not.toHaveBeenCalled();
  });

  it("reattaches on active server change when subscribers exist", async () => {
    const socket = fakeSocket();
    io._addToRoom("container:logs", socket.id);
    await streamer.subscribe(socket);

    docker.streamContainerLogs.mockClear();
    await streamer.onActiveServerChanged();

    expect(docker._cancelFn).toHaveBeenCalled();
    expect(docker.streamContainerLogs).toHaveBeenCalled();
  });

  it("detaches on active server change when no subscribers", async () => {
    const socket = fakeSocket();
    io._addToRoom("container:logs", socket.id);
    await streamer.subscribe(socket);

    io._removeFromRoom("container:logs", socket.id);
    await streamer.onActiveServerChanged();

    expect(docker._cancelFn).toHaveBeenCalled();
    expect(streamer.activeContainerId).toBeNull();
  });

  it("emits log entries to the room", async () => {
    const emitFn = vi.fn();
    io.to.mockReturnValue({ emit: emitFn });

    const socket = fakeSocket();
    io._addToRoom("container:logs", socket.id);
    await streamer.subscribe(socket);

    // Get the onLine callback and call it
    const onLine = docker.streamContainerLogs.mock.calls[0][1];
    onLine({ line: "Server started", stream: "stdout" });

    expect(io.to).toHaveBeenCalledWith("container:logs");
    expect(emitFn).toHaveBeenCalledWith("container:log", {
      line: "Server started",
      stream: "stdout",
    });
  });

  it("does nothing when Docker is unavailable", async () => {
    const unavailable = fakeDockerClient({ available: false });
    unavailable.available = false;
    const s = new ContainerLogStreamer(io, unavailable);

    const socket = fakeSocket();
    await s.subscribe(socket);

    expect(unavailable.streamContainerLogs).not.toHaveBeenCalled();
  });

  it("stop() cancels the stream", async () => {
    const socket = fakeSocket();
    io._addToRoom("container:logs", socket.id);
    await streamer.subscribe(socket);

    streamer.stop();

    expect(docker._cancelFn).toHaveBeenCalled();
    expect(streamer.activeContainerId).toBeNull();
  });
});
