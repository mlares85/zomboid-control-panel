import { useState, useRef, useEffect } from "react";
import { serverApi, serversApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { reportClientError } from "@/lib/client-errors";
import type { InstallLog } from "./types";

// Fields needed to submit POST /server/quick-setup and, on success,
// (re-)register the server in the panel database.
export interface QuickSetupFormSnapshot {
  installPath: string;
  serverName: string;
  zomboidDataPath: string;
  useCustomDataPath: boolean;
  rconPort: number;
  rconPassword: string;
  serverPort: number;
  minMemory: number;
  maxMemory: number;
  adminPassword: string;
  useUpnp: boolean;
  useNoSteam: boolean;
  useDebug: boolean;
}

// Response shape from POST /server/quick-setup (server/routes/server/quickSetup.js).
interface QuickSetupResult {
  serverName?: string;
  installPath?: string;
  zomboidDataPath?: string | null;
  serverConfigPath?: string | null;
  rconPort?: number;
  rconPassword?: string;
  serverPort?: number;
  minMemory?: number;
  maxMemory?: number;
}

// Step 3 state: create trigger, log output, and server registration on completion.
// Quick setup is a plain request/response (no SteamCMD download), so unlike
// useInstallProcess this has no socket subscription or progress parsing.
export function useQuickSetupProcess(onServerCreated: (serverId: string | number) => void) {
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<InstallLog[]>([]);
  const [installComplete, setInstallComplete] = useState(false);

  const { toast } = useToast();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (type: InstallLog["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message, timestamp: new Date() }]);
  };

  const registerServer = async (
    data: QuickSetupResult,
    fallback: QuickSetupFormSnapshot,
  ) => {
    try {
      const createResult = await serversApi.create({
        name: data.serverName || fallback.serverName,
        serverName: data.serverName || fallback.serverName,
        installPath: data.installPath || fallback.installPath,
        zomboidDataPath: data.zomboidDataPath || null,
        serverConfigPath: data.serverConfigPath || null,
        rconHost: "127.0.0.1",
        rconPort: data.rconPort || fallback.rconPort,
        rconPassword: data.rconPassword || fallback.rconPassword,
        serverPort: data.serverPort || fallback.serverPort,
        minMemory: (data.minMemory || fallback.minMemory) * 1024,
        maxMemory: (data.maxMemory || fallback.maxMemory) * 1024,
        useNoSteam: fallback.useNoSteam,
        useDebug: fallback.useDebug,
      });
      addLog("success", "Server registered in panel database");
      if (!createResult.server?.id) return;
      await serversApi.activate(createResult.server.id);
      addLog("success", "Switched active server to new installation");
      toast({
        title: "Server Added",
        description: "Server configuration was created successfully.",
      });
      onServerCreated(createResult.server.id);
    } catch (error) {
      reportClientError("Failed to create server entry.", error);
      addLog("error", "Warning: Failed to register server in panel.");
    }
  };

  const handleQuickSetup = async (form: QuickSetupFormSnapshot) => {
    if (!form.adminPassword) {
      toast({
        title: "Admin Password Required",
        description: "Enter an admin password before creating this server.",
        variant: "destructive",
      });
      return;
    }
    setInstalling(true);
    setLogs([]);
    addLog("info", "Creating server configuration...");

    try {
      const data = (await serverApi.quickSetup({
        installPath: form.installPath,
        serverName: form.serverName,
        zomboidDataPath: form.useCustomDataPath ? form.zomboidDataPath : null,
        minMemory: form.minMemory,
        maxMemory: form.maxMemory,
        adminPassword: form.adminPassword || null,
        serverPort: form.serverPort,
        useUpnp: form.useUpnp,
        useNoSteam: form.useNoSteam,
        useDebug: form.useDebug,
        rconPassword: form.rconPassword,
        rconPort: form.rconPort,
      })) as QuickSetupResult;

      addLog("success", "Server configuration created successfully!");
      await registerServer(data, form);
      setInstallComplete(true);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Unexpected error while creating server.";
      addLog("error", msg);
      toast({ title: "Setup Failed", description: msg, variant: "destructive" });
    } finally {
      setInstalling(false);
    }
  };

  return { installing, logs, installComplete, logsEndRef, handleQuickSetup };
}
