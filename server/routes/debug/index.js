import express from "express";
import systemRouter from "./routes/system.js";
import logsRouter from "./routes/logs.js";
import pathsRouter from "./routes/paths.js";
import diagnosticsRouter from "./routes/diagnostics.js";
import worldmapRouter from "./routes/worldmap.js";
import performanceRouter from "./routes/performance.js";
import databaseRouter from "./routes/database.js";
import locksRouter from "./routes/locks.js";
import crashLogsRouter from "./routes/crashLogs.js";
import clientErrorsRouter from "./routes/clientErrors.js";
import activityRouter from "./routes/activity.js";

const router = express.Router();

router.use(systemRouter);
router.use(logsRouter);
router.use(pathsRouter);
router.use(diagnosticsRouter);
router.use(worldmapRouter);
router.use(performanceRouter);
router.use(databaseRouter);
router.use(locksRouter);
router.use(crashLogsRouter);
router.use(clientErrorsRouter);
router.use(activityRouter);

export default router;
export { addLogToBuffer, logBuffer } from "./logBuffer.js";
export { getDiskFree } from "./fsProbe.js";
