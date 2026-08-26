// Routes for Windows auto-start (Task Scheduler) management.
import express from "express";
import {
  getAutoStartStatus,
  enableAutoStart,
  disableAutoStart,
} from "../../utils/windowsAutoStart.js";

const router = express.Router();

router.get("/auto-start", async (_req, res) => {
  const status = await getAutoStartStatus();
  res.json(status);
});

router.post("/auto-start", async (req, res) => {
  const { enabled } = req.body;
  const result = enabled
    ? await enableAutoStart()
    : await disableAutoStart();

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }
  res.json({ success: true, enabled: !!enabled });
});

export default router;
