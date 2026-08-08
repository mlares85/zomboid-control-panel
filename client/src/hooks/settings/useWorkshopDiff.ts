import { useCallback, useEffect, useRef, useState } from "react";
import { modsApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

export type WorkshopItemFilter =
  | "all"
  | "missing"
  | "not-on-server"
  | "tracked-only"
  | "synced"
  | "tracked"
  | "collection";

export type WorkshopRowAction =
  | "add"
  | "remove"
  | "track"
  | "untrack"
  | "add-server"
  | "remove-server"
  | "purge";

// Workshop <-> tracked-mod drift detection and the per-row actions
// (add/remove from collection, track/untrack, add/remove from server,
// purge everywhere) for the unified mod table.
export function useWorkshopDiff(
  collectionIdValid: boolean,
  credsConfigured: boolean,
) {
  const { toast } = useToast();
  const [diff, setDiff] = useState<Awaited<
    ReturnType<typeof modsApi.collectionDiff>
  > | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffCheckedAt, setDiffCheckedAt] = useState<Date | null>(null);
  const [testing, setTesting] = useState(false);
  const [itemFilter, setItemFilter] = useState<WorkshopItemFilter>("missing");
  const [itemSearch, setItemSearch] = useState("");
  // Per-row busy flag: { [workshopId]: action | null }
  const [rowBusy, setRowBusy] = useState<Record<string, string | null>>({});
  const [purgeTarget, setPurgeTarget] = useState<{
    workshopId: string;
    name: string | null;
  } | null>(null);

  const refreshDiffSeqRef = useRef(0);
  const refreshDiff = useCallback(async () => {
    if (!collectionIdValid) return;
    const seq = ++refreshDiffSeqRef.current;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const r = await modsApi.collectionDiff();
      // A newer call started after us — drop this stale result.
      if (seq !== refreshDiffSeqRef.current) return;
      setDiff(r);
      setDiffCheckedAt(new Date());
      if (!r.ok && r.error) setDiffError(r.error);
    } catch (err: any) {
      if (seq !== refreshDiffSeqRef.current) return;
      setDiffError(err?.message || "Failed to read collection");
    } finally {
      if (seq === refreshDiffSeqRef.current) setDiffLoading(false);
    }
  }, [collectionIdValid]);

  // Auto-load the diff once when the card mounts with a valid collection ID.
  // Cheap public API, gives the user immediate context without clicking.
  useEffect(() => {
    if (collectionIdValid && !diff && !diffLoading && !diffError) {
      refreshDiff();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionIdValid]);

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const r = await modsApi.collectionTest();
      toast({ title: "Connection OK", description: r.message });
      await refreshDiff();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Test failed",
        description: err?.message || "Could not reach collection",
      });
    } finally {
      setTesting(false);
    }
  };

  // ── Unified item table derivation ───────────────────────────────────────
  const allItems = diff?.ok && Array.isArray(diff.items) ? diff.items : [];
  const missingCount = allItems.filter((it) => it.status === "to-add").length;
  const notOnServerCount = allItems.filter(
    (it) => it.status === "collection-only",
  ).length;
  const trackedOnlyCount = allItems.filter(
    (it) => it.status === "tracked-only",
  ).length;
  const syncedCount = allItems.filter((it) => it.status === "synced").length;
  const driftCount = missingCount + notOnServerCount + trackedOnlyCount;
  const inSync = !!diff?.ok && driftCount === 0;
  const filteredItems = allItems.filter((it) => {
    if (itemFilter === "missing" && it.status !== "to-add") return false;
    if (itemFilter === "not-on-server" && it.status !== "collection-only")
      return false;
    if (itemFilter === "tracked-only" && it.status !== "tracked-only")
      return false;
    if (itemFilter === "synced" && it.status !== "synced") return false;
    if (itemFilter === "tracked" && !it.inTracked) return false;
    if (itemFilter === "collection" && !it.inCollection) return false;
    if (itemSearch.trim()) {
      const q = itemSearch.trim().toLowerCase();
      if (
        !it.workshopId.includes(q) &&
        !(it.name || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Row-level actions. Optimistic feel: spinner on the clicked button, then
  // re-fetch the diff. Errors surface as toasts and the row remains
  // unchanged because refreshDiff re-reads ground truth from Steam.
  const runRowAction = async (
    workshopId: string,
    action: WorkshopRowAction,
    name?: string | null,
  ) => {
    setRowBusy((prev) => ({ ...prev, [workshopId]: action }));
    try {
      if (action === "add") {
        if (!credsConfigured)
          throw new Error(
            "Add Steam cookies first to write to the collection.",
          );
        await modsApi.collectionAddItem(workshopId);
      } else if (action === "remove") {
        if (!credsConfigured)
          throw new Error(
            "Add Steam cookies first to write to the collection.",
          );
        await modsApi.collectionRemoveItem(workshopId);
      } else if (action === "track") {
        await modsApi.trackMod(workshopId);
      } else if (action === "untrack") {
        await modsApi.untrackMod(workshopId);
      } else if (action === "add-server") {
        await modsApi.addToIni(workshopId);
        // Tracking is what drives update checks, so a mod the server now
        // loads should be watched too.
        if (!allItems.find((it) => it.workshopId === workshopId)?.inTracked) {
          await modsApi.trackMod(workshopId);
        }
        toast({
          title: "Added to the server",
          description:
            "Project Zomboid will download and load this mod on the next server restart.",
        });
      } else if (action === "remove-server") {
        await modsApi.batchRemove([workshopId]);
        toast({
          title: "Removed from the server",
          description: diff?.autoSync
            ? "It will also be removed from the Steam collection."
            : "The Steam collection was left unchanged because auto-sync is off.",
        });
      } else if (action === "purge") {
        const r = await modsApi.purgeMod(workshopId, name);
        const done = [
          r.collection.attempted
            ? r.collection.ok
              ? "removed from the collection"
              : `collection not updated (${r.collection.error || "Steam rejected the change"})`
            : null,
          "removed from the server config",
          r.deletedFromDisk ? "deleted from disk" : "no files on disk",
          "untracked and ignored",
        ].filter(Boolean);
        toast({
          title: `Removed ${r.name || workshopId} everywhere`,
          description: `${done.join(", ")}.`,
        });
      }
      await refreshDiff();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: err?.message || "Steam rejected the change",
      });
    } finally {
      setRowBusy((prev) => {
        const next = { ...prev };
        delete next[workshopId];
        return next;
      });
    }
  };

  return {
    diff,
    diffError,
    diffLoading,
    diffCheckedAt,
    refreshDiff,
    testing,
    handleTest,
    itemFilter,
    setItemFilter,
    itemSearch,
    setItemSearch,
    rowBusy,
    purgeTarget,
    setPurgeTarget,
    allItems,
    missingCount,
    notOnServerCount,
    trackedOnlyCount,
    syncedCount,
    driftCount,
    inSync,
    filteredItems,
    runRowAction,
  };
}
