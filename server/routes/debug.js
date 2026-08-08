// This file used to hold every /api/debug route in one ~4,600-line module.
// It has been decomposed into server/routes/debug/ (logs, system,
// diagnostics, world map, database, etc. each in their own file). This shim
// re-exports the combined router so existing imports of this path
// keep working unchanged.
export { default, addLogToBuffer, logBuffer, getDiskFree } from "./debug/index.js";
