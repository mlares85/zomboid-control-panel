import { createLogger } from "./logger.js";

const log = createLogger("safeEmit");

/**
 * Wrap a Socket.IO server (or namespace) so every .emit() is try-caught.
 * A synchronous throw inside Socket.IO (disconnected socket, circular JSON,
 * etc.) would otherwise crash the Node process.
 *
 * Usage:
 *   const safe = safeIo(io);
 *   safe.emit("event", data);           // io.emit, caught
 *   safe.to("room").emit("event", data); // io.to().emit, caught
 */
export function safeIo(io) {
  return new Proxy(io, {
    get(target, prop) {
      if (prop === "emit") {
        return (...args) => {
          try {
            return target.emit(...args);
          } catch (err) {
            log.error(`io.emit(${String(args[0])}) threw: ${err.message}`);
          }
        };
      }
      if (prop === "to" || prop === "in") {
        return (...rooms) => {
          const scoped = target[prop](...rooms);
          return new Proxy(scoped, {
            get(t, p) {
              if (p === "emit") {
                return (...args) => {
                  try {
                    return t.emit(...args);
                  } catch (err) {
                    log.error(
                      `io.to(${rooms}).emit(${String(args[0])}) threw: ${err.message}`,
                    );
                  }
                };
              }
              return t[p];
            },
          });
        };
      }
      return target[prop];
    },
  });
}
