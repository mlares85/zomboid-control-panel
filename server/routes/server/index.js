// Active PZ server routes, decomposed by concern. Every sub-module registers
// its routes directly onto the single shared `router` instance (rather than
// being mounted as nested sub-routers) so `router.stack` stays flat — some
// tests (e.g. wipeConcurrency.test.js) introspect it directly by route path.
import express from "express";
import { registerStatusRoutes } from "./status.js";
import { registerLifecycleRoutes } from "./lifecycle.js";
import { registerCommandRoutes } from "./commands.js";
import { registerInstallRoutes } from "./install.js";
import { registerConfigRoutes } from "./config.js";
import { registerConsoleRoutes } from "./console.js";
import { registerWipeRoutes } from "./wipe.js";

const router = express.Router();

registerStatusRoutes(router);
registerLifecycleRoutes(router);
registerCommandRoutes(router);
registerInstallRoutes(router);
registerConfigRoutes(router);
registerConsoleRoutes(router);
registerWipeRoutes(router);

export default router;
