import { useEffect, useState } from "react";
import { pushoverApi, type PushoverSettings } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

const EMPTY_SETTINGS: PushoverSettings = {
  enabled: false,
  userKey: "",
  apiToken: "",
};

/** Loads and saves the Pushover User Key / API Token pair, and drives the "send test" action. */
export function usePushoverSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PushoverSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pushoverApi
      .getSettings()
      .then((result) => {
        if (!cancelled) setSettings(result);
      })
      .catch(() => { /* leave defaults — the card shows empty fields to fill in */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = <K extends keyof PushoverSettings>(
    key: K,
    value: PushoverSettings[K],
  ) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await pushoverApi.updateSettings(settings);
      toast({
        title: "Saved",
        description: "Pushover settings updated.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save settings.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await pushoverApi.test();
      toast({
        title: "Test sent",
        description: "Check your device for the Pushover notification.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Test failed",
        description: error instanceof Error ? error.message : "Could not send a test notification.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  return { settings, loading, saving, testing, updateField, handleSave, handleTest };
}
