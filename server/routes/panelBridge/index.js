/**
 * PanelBridge API Routes
 *
 * REST API endpoints to manage and interact with the PanelBridge mod.
 * Split by concern — see each sub-module for its slice of the ~80 routes
 * this used to be a single 3,700-line file.
 */

import express from "express";
import connectionRoutes from "./connection.js";
import connectionSetupRoutes from "./connectionSetup.js";
import sftpRoutes from "./sftp.js";
import installSftpRoutes from "./installSftp.js";
import installDockerRoutes from "./installDocker.js";
import modInstallRoutes from "./modInstall.js";
import commandRoutes from "./command.js";
import weatherRoutes from "./weather.js";
import climateRoutes from "./climate.js";
import worldRoutes from "./world.js";
import soundRoutes from "./sound.js";
import playersRoutes from "./players.js";
import zombiesRoutes from "./zombies.js";
import eventsRoutes from "./events.js";
import charactersRoutes from "./characters.js";
import chatRoutes from "./chat.js";
import debugRoutes from "./debug.js";
import catalogRoutes from "./catalog.js";

const router = express.Router();

router.use(connectionRoutes);
router.use(connectionSetupRoutes);
router.use(sftpRoutes);
router.use(installSftpRoutes);
router.use(installDockerRoutes);
router.use(modInstallRoutes);
router.use(commandRoutes);
router.use(weatherRoutes);
router.use(climateRoutes);
router.use(worldRoutes);
router.use(soundRoutes);
router.use(playersRoutes);
router.use(zombiesRoutes);
router.use(eventsRoutes);
router.use(charactersRoutes);
router.use(chatRoutes);
router.use(debugRoutes);
router.use(catalogRoutes);

export default router;
