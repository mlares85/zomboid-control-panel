import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bookmark,
  BookmarkPlus,
  Check,
  Library,
  Loader2,
  Minus,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { modsApi } from "@/lib/api";
import { WorkshopRowAction } from "@/hooks/settings/useWorkshopDiff";

type WorkshopDiffItem = Awaited<
  ReturnType<typeof modsApi.collectionDiff>
>["items"][number];

interface WorkshopItemRowProps {
  item: WorkshopDiffItem;
  busy: string | null | undefined;
  credsConfigured: boolean;
  runRowAction: (workshopId: string, action: WorkshopRowAction) => void;
  onPurge: (workshopId: string, name: string | null) => void;
}

const STATUS_META: Record<
  WorkshopDiffItem["status"],
  { label: string; cls: string; icon: ReactNode }
> = {
  synced: {
    label: "In sync",
    cls: "text-success border-success/40 bg-success/10",
    icon: <Check className="w-3 h-3" />,
  },
  "to-add": {
    label: "Missing from collection",
    cls: "text-warning border-warning/40 bg-warning/10",
    icon: <Plus className="w-3 h-3" />,
  },
  "collection-only": {
    label: "Not on server",
    cls: "text-primary border-primary/40 bg-primary/10",
    icon: <Library className="w-3 h-3" />,
  },
  "tracked-only": {
    label: "Tracked only",
    cls: "text-muted-foreground border-border bg-muted/40",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

export function WorkshopItemRow({
  item,
  busy,
  credsConfigured,
  runRowAction,
  onPurge,
}: WorkshopItemRowProps) {
  const statusMeta = STATUS_META[item.status];

  return (
    <tr className="border-b border-border/30 last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-2 align-top">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium",
            statusMeta.cls,
          )}
        >
          {statusMeta.icon}
          {statusMeta.label}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col min-w-0">
          <a
            href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${item.workshopId}`}
            target="_blank"
            rel="noreferrer"
            className="truncate text-foreground hover:text-primary hover:underline underline-offset-2 font-medium"
            title={item.name || item.workshopId}
          >
            {item.name || (
              <span className="font-mono text-muted-foreground">
                {item.workshopId}
              </span>
            )}
          </a>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 font-mono">
            <span>{item.workshopId}</span>
            <span>·</span>
            <span>{item.inTracked ? "tracked" : "not tracked"}</span>
            <span>·</span>
            <span>
              {item.inCollection ? "in collection" : "not in collection"}
            </span>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center justify-end gap-1">
          {/* Ordered by consequence: what the server loads, then the
              collection, then local tracking, then the destructive one. */}
          {item.inServer ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => runRowAction(item.workshopId, "remove-server")}
              disabled={!!busy}
              title="Remove this mod from the server configuration"
            >
              {busy === "remove-server" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Server className="w-3 h-3" />
              )}
              <span className="ml-1">From server</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-success hover:text-success hover:bg-success/10"
              onClick={() => runRowAction(item.workshopId, "add-server")}
              disabled={!!busy}
              title="Add this mod to the server configuration"
            >
              {busy === "add-server" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Server className="w-3 h-3" />
              )}
              <span className="ml-1">To server</span>
            </Button>
          )}
          {item.inCollection ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => runRowAction(item.workshopId, "remove")}
              disabled={!!busy || !credsConfigured}
              title={
                !credsConfigured
                  ? "Need Steam cookies"
                  : "Remove from Steam collection"
              }
            >
              {busy === "remove" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              <span className="ml-1">From collection</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-success hover:text-success hover:bg-success/10"
              onClick={() => runRowAction(item.workshopId, "add")}
              disabled={!!busy || !credsConfigured}
              title={
                !credsConfigured
                  ? "Need Steam cookies"
                  : "Add to Steam collection"
              }
            >
              {busy === "add" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              <span className="ml-1">To collection</span>
            </Button>
          )}
          {item.inTracked ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => runRowAction(item.workshopId, "untrack")}
              disabled={!!busy}
              title="Untrack locally (panel stops watching this mod)"
            >
              {busy === "untrack" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Bookmark className="w-3 h-3" />
              )}
              <span className="ml-1">Untrack</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={() => runRowAction(item.workshopId, "track")}
              disabled={!!busy}
              title="Track locally (panel will watch this mod for updates)"
            >
              {busy === "track" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <BookmarkPlus className="w-3 h-3" />
              )}
              <span className="ml-1">Track</span>
            </Button>
          )}
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onPurge(item.workshopId, item.name)}
            disabled={!!busy}
            title="Remove from the collection, the server, and disk, then ignore it so it can't come back"
          >
            {busy === "purge" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            <span className="ml-1">Everywhere</span>
          </Button>
        </div>
      </td>
    </tr>
  );
}
