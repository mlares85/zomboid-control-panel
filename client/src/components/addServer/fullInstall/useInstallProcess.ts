import { useState, useContext, useRef, useEffect } from "react";
import { serverApi, serversApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { SocketContext } from "@/contexts/SocketContext";
import { reportClientError } from "@/lib/client-errors";
import { formatBytes, installationErrorGuidance } from "./helpers";
import type { InstallLog } from "./types";

// Fields needed to (re-)register the server in the panel database once
// SteamCMD reports success. Captured live via a ref so the async
// install:complete socket handler always sees current form values.
export interface InstallFormSnapshot {
  serverName: string;
  installPath: string;
  zomboidDataPath: string;
  useCustomDataPath: boolean;
  rconPort: number;
  rconPassword: string;
  serverPort: number;
  minMemory: number;
  maxMemory: number;
  useNoSteam: boolean;
  useDebug: boolean;
}

export interface InstallPayload {
  steamcmdPath: string;
  installPath: string;
  serverName: string;
  branch: string;
  zomboidDataPath: string | null;
  minMemory: number;
  maxMemory: number;
  adminPassword: string | null;
  serverPort: number;
  useUpnp: boolean;
  useNoSteam: boolean;
  useDebug: boolean;
  rconPassword: string;
  rconPort: number;
}

// Step 4 state: install trigger, progress parsing, log output, and
// server registration on completion.
export function useInstallProcess(
  formSnapshot: InstallFormSnapshot,
  onServerCreated: (serverId: string | number) => void,
) {
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<InstallLog[]>([]);
  const [installComplete, setInstallComplete] = useState(false);
  const [installProgress, setInstallProgress] = useState<{
    percent: number;
    downloaded: string;
    total: string;
    status: string;
  } | null>(null);

  const { toast } = useToast();
  const socket = useContext(SocketContext);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Writing to a ref during render is safe and keeps the async socket
  // handler below reading the latest form values without re-subscribing.
  const formStateRef = useRef(formSnapshot);
  formStateRef.current = formSnapshot;

  const onServerCreatedRef = useRef(onServerCreated);
  onServerCreatedRef.current = onServerCreated;

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (type: InstallLog["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message, timestamp: new Date() }]);
  };

  useEffect(() => {
    if (!socket) return;

    const handleInstallLog = (data: { type: "stdout" | "stderr"; text: string }) => {
      const text = data.text.trim();
      setLogs((prev) => [...prev, { type: data.type, message: text, timestamp: new Date() }]);

      const progressMatch = text.match(/progress:\s*([\d.]+)\s*\(([\d,]+)\s*\/\s*([\d,]+)\)/);
      if (progressMatch) {
        setInstallProgress({
          percent: parseFloat(progressMatch[1]),
          downloaded: formatBytes(parseInt(progressMatch[2].replace(/,/g, ""))),
          total: formatBytes(parseInt(progressMatch[3].replace(/,/g, ""))),
          status: "Downloading...",
        });
      }
      const validateMatch = text.match(/[Vv]alidat\w*[^\d]*(\d+)%/);
      if (validateMatch) {
        setInstallProgress({
          percent: parseInt(validateMatch[1]),
          downloaded: "",
          total: "",
          status: "Validating files...",
        });
      }
      if (text.includes("Update state") && text.includes("verifying")) {
        setInstallProgress((prev) => (prev ? { ...prev, status: "Verifying installation..." } : null));
      }
      if (text.includes("Success!") || text.includes("fully installed")) {
        setInstallProgress({ percent: 100, downloaded: "", total: "", status: "Complete!" });
      }
    };

    const handleInstallComplete = async (data: {
      success: boolean;
      message: string;
      installPath?: string;
      serverName?: string;
      zomboidDataPath?: string;
      serverConfigPath?: string;
      rconPort?: number;
      rconPassword?: string;
      serverPort?: number;
      minMemory?: number;
      maxMemory?: number;
    }) => {
      setInstalling(false);
      setInstallComplete(data.success);
      if (!data.success) {
        setLogs((prev) => [...prev, { type: "error", message: data.message, timestamp: new Date() }]);
        toast({ title: "Installation Failed", description: data.message, variant: "destructive" });
        return;
      }

      setLogs((prev) => [...prev, { type: "success", message: data.message, timestamp: new Date() }]);

      try {
        const s = formStateRef.current;
        const createResult = await serversApi.create({
          name: data.serverName || s.serverName,
          serverName: data.serverName || s.serverName,
          installPath: data.installPath || s.installPath,
          zomboidDataPath: data.zomboidDataPath || null,
          serverConfigPath: data.serverConfigPath || null,
          rconHost: "127.0.0.1",
          rconPort: data.rconPort || s.rconPort,
          rconPassword: data.rconPassword || s.rconPassword,
          serverPort: data.serverPort || s.serverPort,
          minMemory: (data.minMemory || s.minMemory) * 1024,
          maxMemory: (data.maxMemory || s.maxMemory) * 1024,
          useNoSteam: s.useNoSteam,
          useDebug: s.useDebug,
        });
        setLogs((prev) => [
          ...prev,
          { type: "success", message: "Server registered in panel database", timestamp: new Date() },
        ]);

        if (createResult.server?.id) {
          await serversApi.activate(createResult.server.id);
          setLogs((prev) => [
            ...prev,
            { type: "success", message: "Switched active server to new installation", timestamp: new Date() },
          ]);
          toast({
            title: "Server Installed",
            description: "Project Zomboid server files were installed successfully.",
          });
          onServerCreatedRef.current(createResult.server.id);
        }
      } catch (error) {
        reportClientError("Failed to create server entry.", error);
        setLogs((prev) => [
          ...prev,
          { type: "error", message: "Warning: Failed to register server in panel.", timestamp: new Date() },
        ]);
      }
    };

    socket.on("install:log", handleInstallLog);
    socket.on("install:complete", handleInstallComplete);
    return () => {
      socket.off("install:log", handleInstallLog);
      socket.off("install:complete", handleInstallComplete);
    };
  }, [socket, toast]);

  const handleInstall = async (payload: InstallPayload) => {
    if (!payload.adminPassword) {
      toast({
        title: "Admin Password Required",
        description: "Enter an admin password before starting installation.",
        variant: "destructive",
      });
      return;
    }
    setInstalling(true);
    setLogs([]);
    setInstallProgress(null);
    addLog("info", "Starting installation...");

    try {
      await serverApi.install(payload as unknown as Record<string, unknown>);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      const msg = installationErrorGuidance(rawMessage);
      addLog("error", msg);
      setInstalling(false);
      toast({ title: "Installation Failed", description: msg, variant: "destructive" });
    }
  };

  return {
    installing,
    logs,
    installComplete,
    installProgress,
    logsEndRef,
    handleInstall,
  };
}
