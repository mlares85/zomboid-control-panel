import { useState, useEffect, useRef } from "react";
import { configApi, debugApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { reportClientError } from "@/lib/client-errors";
import { copyText } from "@/lib/utils";
import { generatePassword } from "./helpers";

type SystemRam = {
  totalGB: number;
  freeGB: number;
  recommendedMin: number;
  recommendedMax: number;
};

// Steps 1-2 state: server files location, identity, RCON/admin credentials,
// memory allocation, and advanced runtime options.
export function useQuickConfigStep({ initialInstallPath }: { initialInstallPath?: string } = {}) {
  const [installPath, setInstallPath] = useState(initialInstallPath || "");
  const [serverName, setServerName] = useState("myserver");
  const [rconPassword, setRconPassword] = useState("");
  const [rconPort, setRconPort] = useState(27015);
  const [showRconPassword, setShowRconPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [minMemory, setMinMemory] = useState(4);
  const [maxMemory, setMaxMemory] = useState(8);
  const [serverPort, setServerPort] = useState(16261);
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [useUpnp, setUseUpnp] = useState(true);
  const [useNoSteam, setUseNoSteam] = useState(false);
  const [useDebug, setUseDebug] = useState(false);
  const [systemRam, setSystemRam] = useState<SystemRam | null>(null);
  const [detectingRam, setDetectingRam] = useState(false);
  const [useCustomDataPath, setUseCustomDataPath] = useState(false);
  const [zomboidDataPath, setZomboidDataPath] = useState("");
  const missingAdminPassword = adminPassword.trim().length === 0;

  const { toast } = useToast();

  // Generate a random RCON password on mount if empty
  useEffect(() => {
    if (!rconPassword) setRconPassword(generatePassword(12));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only

  // Auto-detect RAM on mount
  useEffect(() => {
    const detectRam = async () => {
      setDetectingRam(true);
      try {
        const data = await debugApi.getRam();
        setSystemRam(data);
        setMinMemory(data.recommendedMin);
        setMaxMemory(data.recommendedMax);
      } catch {
        // Silent fail - defaults are fine
      } finally {
        setDetectingRam(false);
      }
    };
    detectRam();
  }, []);

  // Load previously saved install path / server name / data path / memory / port
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await configApi.getAppSettings();
        const settings = data.settings || {};
        if (settings.serverPath) setInstallPath(settings.serverPath);
        if (settings.serverName) setServerName(settings.serverName);
        if (settings.zomboidDataPath) {
          setZomboidDataPath(settings.zomboidDataPath);
          setUseCustomDataPath(true);
        }
        if (settings.minMemory)
          setMinMemory(
            Math.min(16, Math.max(2, Math.round(settings.minMemory / 1024) || 4)),
          );
        if (settings.maxMemory)
          setMaxMemory(
            Math.min(16, Math.max(2, Math.round(settings.maxMemory / 1024) || 8)),
          );
        if (settings.serverPort) setServerPort(settings.serverPort);
      } catch (error) {
        reportClientError("Failed to load settings.", error);
      }
    };
    loadSettings();
  }, []);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const handleCopyPassword = () => {
    copyText(rconPassword);
    setCopiedPassword(true);
    toast({ title: "Password Copied", description: "RCON password copied to clipboard." });
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleRegeneratePassword = () => {
    setRconPassword(generatePassword(12));
    toast({ title: "Password Generated", description: "A new RCON password has been generated." });
  };

  return {
    installPath,
    setInstallPath,
    serverName,
    setServerName,
    rconPassword,
    setRconPassword,
    rconPort,
    setRconPort,
    showRconPassword,
    setShowRconPassword,
    copiedPassword,
    handleCopyPassword,
    handleRegeneratePassword,
    minMemory,
    setMinMemory,
    maxMemory,
    setMaxMemory,
    serverPort,
    setServerPort,
    adminPassword,
    setAdminPassword,
    showAdminPassword,
    setShowAdminPassword,
    useUpnp,
    setUseUpnp,
    useNoSteam,
    setUseNoSteam,
    useDebug,
    setUseDebug,
    systemRam,
    detectingRam,
    useCustomDataPath,
    setUseCustomDataPath,
    zomboidDataPath,
    setZomboidDataPath,
    missingAdminPassword,
  };
}
