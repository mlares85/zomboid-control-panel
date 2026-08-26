import { useState, useEffect } from "react";
import { configApi, serverApi } from "@/lib/api";
import type { SteamBranch } from "@/lib/api";
import { reportClientError } from "@/lib/client-errors";

const DEFAULT_BRANCHES: SteamBranch[] = [
  { name: "public", description: "Stable release (Build 42)" },
  { name: "b41multiplayer", description: "Build 41 Multiplayer" },
];

// Step 2 state: install path, server name, game branch, and custom data path.
export function useInstallConfigStep(
  hasSteamCmd: boolean,
  steamCmdPath: string,
  initialBranch?: string,
  initialInstallPath?: string,
) {
  const [installPath, setInstallPath] = useState(initialInstallPath || "");
  const [serverName, setServerName] = useState("myserver");
  const [branch, setBranch] = useState(initialBranch || "public");
  const [availableBranches, setAvailableBranches] =
    useState<SteamBranch[]>(DEFAULT_BRANCHES);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [useCustomDataPath, setUseCustomDataPath] = useState(false);
  const [zomboidDataPath, setZomboidDataPath] = useState("");

  // Load previously saved install path / server name / data path,
  // then fall back to the server's suggested install path for fresh installs
  useEffect(() => {
    const loadSettings = async () => {
      let hasPath = false;
      try {
        const data = await configApi.getAppSettings();
        const settings = data.settings || {};
        if (settings.serverPath) {
          setInstallPath(settings.serverPath);
          hasPath = true;
        }
        if (settings.serverName) setServerName(settings.serverName);
        if (settings.zomboidDataPath) {
          setZomboidDataPath(settings.zomboidDataPath);
          setUseCustomDataPath(true);
        }
      } catch (error) {
        reportClientError("Failed to load settings.", error);
      }

      // No saved path and none passed via props — use server's suggestion
      if (!hasPath && !initialInstallPath) {
        try {
          const detect = await serverApi.detectSetup();
          if (detect.suggestedInstallPath) {
            setInstallPath(detect.suggestedInstallPath);
          }
        } catch {
          // Non-critical — field stays empty
        }
      }
    };
    loadSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initialInstallPath is stable from props

  // Fetch available Steam branches once SteamCMD is detected
  useEffect(() => {
    const fetchBranches = async () => {
      setLoadingBranches(true);
      try {
        const data = await serverApi.getBranches(steamCmdPath);
        if (data.branches && Array.isArray(data.branches)) {
          setAvailableBranches(data.branches);
          if (!data.branches.find((b) => b.name === branch)) {
            setBranch("public");
          }
        }
      } catch (error) {
        reportClientError("Failed to fetch branches.", error);
      } finally {
        setLoadingBranches(false);
      }
    };

    if (hasSteamCmd && steamCmdPath) fetchBranches();
  }, [hasSteamCmd, steamCmdPath]); // eslint-disable-line react-hooks/exhaustive-deps -- branch intentionally excluded; setBranch('public') fallback isn't a dep

  return {
    installPath,
    setInstallPath,
    serverName,
    setServerName,
    branch,
    setBranch,
    availableBranches,
    loadingBranches,
    useCustomDataPath,
    setUseCustomDataPath,
    zomboidDataPath,
    setZomboidDataPath,
  };
}
