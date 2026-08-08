import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { usePageShortcut } from "../useKeyboardShortcuts";
import { reportClientError } from "@/lib/client-errors";
import { configApi, serverApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  toSettingBoolean,
} from "@/lib/settingsTypes";
import { normalizePort, validateCorsOriginsInput } from "@/lib/settingsFormat";

// Core settings persistence: fetch, edit, save, and the panel-restart flow
// shared by the General and Updates tabs. Split out because `settings` and
// `handleSave` are needed by nearly every settings tab.
export function useAppSettingsCore(
  socket: Socket | null,
  options: { onSaved?: () => Promise<void> } = {},
) {
  const { onSaved } = options;
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [corsOriginValidationError, setCorsOriginValidationError] = useState<
    string | null
  >(null);
  const [restarting, setRestarting] = useState(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty =
    originalSettings !== null &&
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(
    () => () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    },
    [],
  );

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await configApi.getAppSettings();
      if (data.settings) {
        setSettings((prevSettings) => {
          const incoming = data.settings as Partial<AppSettings>;
          const loadedSettings: AppSettings = {
            ...prevSettings,
            ...incoming,
            autoStartServer: toSettingBoolean(incoming.autoStartServer, false),
            autoExportOnLogin: toSettingBoolean(
              incoming.autoExportOnLogin,
              false,
            ),
            autoExportMaxPerPlayer: String(
              incoming.autoExportMaxPerPlayer ??
                prevSettings.autoExportMaxPerPlayer,
            ),
          };
          setOriginalSettings(loadedSettings);
          return loadedSettings;
        });
      }
    } catch (error) {
      reportClientError("Failed to fetch settings.", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Reload settings when active server changes
  useEffect(() => {
    if (!socket) return;
    const handleActiveServerChanged = () => {
      fetchSettings();
    };
    socket.on("activeServerChanged", handleActiveServerChanged);
    return () => {
      socket.off("activeServerChanged", handleActiveServerChanged);
    };
  }, [socket, fetchSettings]);

  useEffect(() => {
    setCorsOriginValidationError(
      validateCorsOriginsInput(settings.corsAllowedOrigins),
    );
  }, [settings.corsAllowedOrigins]);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      // Validate numeric string fields
      if (
        typeof value === "string" &&
        [
          "modCheckInterval",
          "modRestartDelay",
          "reconnectInterval",
          "panelPort",
          "httpsPort",
        ].includes(key)
      ) {
        // Allow empty string but reject non-numeric values
        if (value !== "" && isNaN(parseInt(value))) {
          return; // Don't update with invalid value
        }
      }
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = async () => {
    const validationError = validateCorsOriginsInput(
      settings.corsAllowedOrigins,
    );
    if (validationError) {
      setCorsOriginValidationError(validationError);
      toast({
        title: "Invalid CORS Origins",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await configApi.updateAppSettings(
        settings as unknown as Record<string, unknown>,
      );
      setOriginalSettings(settings); // Reset dirty state after save
      try {
        await onSaved?.();
      } catch {
        // Settings are already saved; this refresh is best-effort.
      }
      toast({
        title: "Settings Saved",
        description: "Your panel settings were saved.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Could Not Save Settings",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not save your settings. Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+S to save settings
  usePageShortcut(
    "s",
    () => {
      if (isDirty && !saving) handleSave();
    },
    { ctrl: true },
  );

  const restartPanelWithReconnect = useCallback(
    async (description: string) => {
      setRestarting(true);
      try {
        await serverApi.restartPanel();
        toast({ title: "Restarting Panel", description });

        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          const newPort = normalizePort(settings.panelPort);
          const newUrl = `${window.location.protocol}//${window.location.hostname}:${newPort}${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.location.href = newUrl;
        }, 3000);
      } catch (err) {
        setRestarting(false);
        const apiErr = err as { code?: string; message?: string };
        if (apiErr?.code === "apply_in_progress") {
          toast({
            title: "Update already in progress",
            description:
              apiErr.message ||
              "An update apply is already running. Wait for the panel to reconnect.",
          });
          return;
        }
        toast({
          title: "Restart Failed",
          description:
            "Could not restart the panel. You may need to restart it manually.",
          variant: "destructive",
        });
      }
    },
    [settings.panelPort, toast],
  );

  return {
    settings,
    setSettings,
    originalSettings,
    setOriginalSettings,
    updateSetting,
    isDirty,
    loading,
    saving,
    fetchSettings,
    handleSave,
    corsOriginValidationError,
    restarting,
    restartPanelWithReconnect,
  };
}
