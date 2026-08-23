import { createLogger } from "../utils/logger.js";
import { getActiveServer } from "../database/init.js";

const log = createLogger("ContainerLogStreamer");

const ROOM = "container:logs";
const EVENT = "container:log";

/**
 * Streams Docker container logs for the active server and broadcasts
 * them to Socket.IO subscribers. Only streams when clients are in the
 * "container:logs" room — starts on first subscriber, stops when the
 * room empties. Re-attaches to a new container when the active server
 * changes.
 */
export class ContainerLogStreamer {
  constructor(io, dockerClient) {
    this.io = io;
    this.dockerClient = dockerClient;
    this.cancelStream = null;
    this.activeContainerId = null;
  }

  /** Begin streaming for the current active server's container. */
  async attach() {
    this.detach();
    if (!this.dockerClient?.available) return;

    const server = await getActiveServer();
    const containerId = server?.dockerContainerId || server?.dockerContainerName;
    if (!containerId) return;

    this.activeContainerId = containerId;
    this.cancelStream = this.dockerClient.streamContainerLogs(
      containerId,
      (entry) => this.io.to(ROOM).emit(EVENT, entry),
      { tail: 0 },
    );
    log.info(`streaming logs for container ${containerId}`);
  }

  /** Stop the current log stream. */
  detach() {
    if (this.cancelStream) {
      this.cancelStream();
      this.cancelStream = null;
      log.info(`detached from container ${this.activeContainerId}`);
    }
    this.activeContainerId = null;
  }

  /** Call when the active server changes — reattaches if subscribers exist. */
  async onActiveServerChanged() {
    if (!this.hasSubscribers()) { this.detach(); return; }
    await this.attach();
  }

  /** Subscribe a socket to the log stream room. Starts streaming if needed. */
  async subscribe(socket) {
    socket.join(ROOM);
    if (!this.cancelStream) await this.attach();
  }

  /** Unsubscribe a socket. Stops streaming when no subscribers remain. */
  unsubscribe(socket) {
    socket.leave(ROOM);
    // Check after a tick so the leave propagates
    setTimeout(() => {
      if (!this.hasSubscribers()) this.detach();
    }, 100);
  }

  hasSubscribers() {
    const room = this.io.sockets.adapter.rooms.get(ROOM);
    return room && room.size > 0;
  }

  stop() {
    this.detach();
  }
}
