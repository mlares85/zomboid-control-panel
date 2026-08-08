/**
 * Auth Routes — /api/auth/*
 * Handles login, setup, token refresh, recovery, and auth status.
 * Split by concern — see each sub-module for its slice of routes.
 */

import { Router } from "express";
import sessionRoutes from "./session.js";
import recoveryRoutes from "./recovery.js";
import passwordResetRoutes from "./passwordReset.js";

const router = Router();

router.use(sessionRoutes);
router.use(recoveryRoutes);
router.use(passwordResetRoutes);

export default router;
export { isLocalPanelRequest, createLocalResetResponse } from "./resetToken.js";
