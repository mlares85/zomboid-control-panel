// Thin re-export for backwards compatibility. The actual routes now live in
// server/routes/server/ (see index.js there), split by concern: lifecycle,
// install, console, status, config, commands, wipe.
export { default } from "./server/index.js";
