import { useCallback, useEffect, useState } from "react";
import { pushoverApi, type PushoverCondition } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

function newCondition(): PushoverCondition {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metric: "cpu",
    operator: ">",
    threshold: 90,
    severity: "normal",
    cooldownMinutes: 15,
    enabled: true,
  };
}

/** Loads and edits the list of Pushover alert conditions (metric/operator/threshold/severity/cooldown). */
export function usePushoverConditions() {
  const { toast } = useToast();
  const [conditions, setConditions] = useState<PushoverCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await pushoverApi.getConditions();
      setConditions(result.conditions);
    } catch { /* leave the list empty — Add starts a fresh condition */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateCondition = (id: string, patch: Partial<PushoverCondition>) =>
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeCondition = (id: string) =>
    setConditions((prev) => prev.filter((c) => c.id !== id));

  const addCondition = () => setConditions((prev) => [...prev, newCondition()]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await pushoverApi.updateConditions(conditions);
      setConditions(result.conditions);
      toast({
        title: "Saved",
        description: "Alert conditions updated.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save conditions.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const result = await pushoverApi.resetConditions();
      setConditions(result.conditions);
      toast({
        title: "Reset",
        description: "Alert conditions restored to defaults.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Could not reset conditions.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  return {
    conditions,
    loading,
    saving,
    resetting,
    updateCondition,
    removeCondition,
    addCondition,
    handleSave,
    handleReset,
  };
}
