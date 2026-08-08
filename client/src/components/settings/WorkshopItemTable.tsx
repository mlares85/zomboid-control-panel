import { Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { modsApi } from "@/lib/api";
import {
  WorkshopItemFilter,
  WorkshopRowAction,
} from "@/hooks/settings/useWorkshopDiff";
import { WorkshopItemRow } from "./WorkshopItemRow";

type WorkshopDiffItem = Awaited<
  ReturnType<typeof modsApi.collectionDiff>
>["items"][number];

interface WorkshopItemTableProps {
  allItems: WorkshopDiffItem[];
  filteredItems: WorkshopDiffItem[];
  itemFilter: WorkshopItemFilter;
  setItemFilter: (filter: WorkshopItemFilter) => void;
  itemSearch: string;
  setItemSearch: (value: string) => void;
  missingCount: number;
  notOnServerCount: number;
  trackedOnlyCount: number;
  syncedCount: number;
  rowBusy: Record<string, string | null>;
  credsConfigured: boolean;
  runRowAction: (workshopId: string, action: WorkshopRowAction) => void;
  onPurge: (workshopId: string, name: string | null) => void;
}

const FILTER_PILLS: Array<[WorkshopItemFilter, string]> = [
  ["missing", "Missing from collection"],
  ["not-on-server", "Not on server"],
  ["tracked-only", "Tracked only"],
  ["synced", "In sync"],
  ["all", "All"],
];

export function WorkshopItemTable({
  allItems,
  filteredItems,
  itemFilter,
  setItemFilter,
  itemSearch,
  setItemSearch,
  missingCount,
  notOnServerCount,
  trackedOnlyCount,
  syncedCount,
  rowBusy,
  credsConfigured,
  runRowAction,
  onPurge,
}: WorkshopItemTableProps) {
  const counts: Record<WorkshopItemFilter, number> = {
    all: allItems.length,
    missing: missingCount,
    "not-on-server": notOnServerCount,
    "tracked-only": trackedOnlyCount,
    synced: syncedCount,
    tracked: 0,
    collection: 0,
  };

  if (!allItems.length) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border/40">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs">
          {FILTER_PILLS.filter(
            ([key]) => key !== "tracked-only" || counts[key] > 0,
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setItemFilter(key)}
              className={cn(
                "px-2 py-1 rounded-sm transition-colors",
                itemFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {label} <span className="opacity-70">({counts[key]})</span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Filter by name or ID…"
            className="h-8 pl-7 pr-7 text-xs w-56"
          />
          {itemSearch && (
            <button
              type="button"
              onClick={() => setItemSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border/60 overflow-hidden">
        <div className="max-h-[420px] overflow-auto">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {itemSearch
                ? "No mods match your search."
                : "Nothing in this filter."}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="font-medium px-3 py-2 w-[120px]">Status</th>
                  <th className="font-medium px-3 py-2">Mod</th>
                  <th className="font-medium px-3 py-2 w-[540px] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it) => (
                  <WorkshopItemRow
                    key={it.workshopId}
                    item={it}
                    busy={rowBusy[it.workshopId]}
                    credsConfigured={credsConfigured}
                    runRowAction={runRowAction}
                    onPurge={onPurge}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20 text-[10px] text-muted-foreground">
          <span>
            {filteredItems.length} of {allItems.length} shown
          </span>
          <span className="hidden sm:inline">
            Per-row actions apply immediately
          </span>
        </div>
      </div>
    </div>
  );
}
