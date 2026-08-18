import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppSettings } from "@/lib/settingsTypes";
import { useWorkshopCookies } from "@/hooks/settings/useWorkshopCookies";
import { useWorkshopDiff } from "@/hooks/settings/useWorkshopDiff";
import { WorkshopCookiesSection } from "./WorkshopCookiesSection";
import { WorkshopItemTable } from "./WorkshopItemTable";
import { WorkshopPurgeDialog } from "./WorkshopPurgeDialog";
import { WorkshopSyncConfigFields } from "./WorkshopSyncConfigFields";

/**
 * Workshop Collection Sync card.
 *
 * Lets the admin keep a personal Steam Workshop collection mirrored against
 * the panel's tracked-mod list. Reading the collection is free (public
 * Steam API). Writing requires the user's `sessionid` + `steamLoginSecure`
 * cookies because Steam exposes no public OAuth for collection edits — same
 * hack used by every PZ collection-sync tool out there.
 *
 * The cookie pair is treated as a secret: it's masked in API responses
 * (server-side `SENSITIVE_KEYS`) and kept off-screen by default behind a
 * show/hide toggle in WorkshopCookiesSection.
 */
interface WorkshopCollectionSyncCardProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  persistCookies: (
    cookies: Pick<AppSettings, "steamSessionId" | "steamLoginSecure">,
  ) => Promise<void>;
}

export function WorkshopCollectionSyncCard({
  settings,
  updateSetting,
  persistCookies,
}: WorkshopCollectionSyncCardProps) {
  const cookies = useWorkshopCookies(updateSetting, persistCookies);

  // Heuristic credential check, used until the diff endpoint reports the
  // server's authoritative `hasCredentials`. The endpoint knows the actual
  // stored (and masked) values; this is just a same-render fallback so the
  // UI doesn't flicker "Not configured" before the first diff loads.
  const heuristicCredsConfigured = (() => {
    const a = settings.steamSessionId || "";
    const b = settings.steamLoginSecure || "";
    return (
      (a.startsWith("•") || a.length >= 8) &&
      (b.startsWith("•") || b.length >= 16)
    );
  })();
  const [diffCredsConfigured, setDiffCredsConfigured] = useState<
    boolean | null
  >(null);
  const effectiveCredsConfigured =
    diffCredsConfigured ?? heuristicCredsConfigured;

  const collectionId = (settings.workshopCollectionId || "").trim();
  const collectionIdValid = /^\d{1,15}$/.test(collectionId);
  const autoSyncOn = !!settings.workshopCollectionAutoSync;

  const diffState = useWorkshopDiff(collectionIdValid, effectiveCredsConfigured);
  const { diff } = diffState;

  useEffect(() => {
    if (diff && typeof diff.hasCredentials === "boolean") {
      setDiffCredsConfigured(diff.hasCredentials);
    }
  }, [diff]);

  return (
    <Card id="settings-workshop-collection">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          Workshop Collection Sync
        </CardTitle>
        <CardDescription>
          Mirror your tracked-mod list into a Steam Workshop collection so
          add/remove only happens in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-7">
        <WorkshopSyncConfigFields
          settings={settings}
          updateSetting={updateSetting}
          autoSyncOn={autoSyncOn}
          effectiveCredsConfigured={effectiveCredsConfigured}
          collectionIdValid={collectionIdValid}
        />

        <WorkshopCookiesSection
          settings={settings}
          updateSetting={updateSetting}
          credsConfigured={effectiveCredsConfigured}
          browsers={cookies.browsers}
          extractingFrom={cookies.extractingFrom}
          savingCookies={cookies.savingCookies}
          showCookies={cookies.showCookies}
          setShowCookies={cookies.setShowCookies}
          pasteOpen={cookies.pasteOpen}
          setPasteOpen={cookies.setPasteOpen}
          pasteText={cookies.pasteText}
          setPasteText={cookies.setPasteText}
          pasteError={cookies.pasteError}
          setPasteError={cookies.setPasteError}
          clipboardReadAvailable={cookies.clipboardReadAvailable}
          handlePasteApply={cookies.handlePasteApply}
          handlePasteFromClipboard={cookies.handlePasteFromClipboard}
          handleAutoExtract={cookies.handleAutoExtract}
        />

        {/* Status / actions */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={diffState.handleTest}
              disabled={
                !collectionIdValid || !effectiveCredsConfigured || diffState.testing
              }
              title={
                !effectiveCredsConfigured
                  ? "Add Steam session cookies first"
                  : "Verify the collection is readable with these cookies"
              }
            >
              {diffState.testing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Test connection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={diffState.refreshDiff}
              disabled={!collectionIdValid || diffState.diffLoading}
            >
              {diffState.diffLoading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Check drift
            </Button>

            <div className="ml-auto text-xs text-muted-foreground">
              {diffState.diffError ? (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {diffState.diffError}
                </span>
              ) : !collectionIdValid ? (
                <span>Enter a Collection ID to begin.</span>
              ) : !diff ? (
                <span>
                  {diffState.diffLoading
                    ? "Reading collection…"
                    : 'Click "Check drift" to compare.'}
                </span>
              ) : !diff.ok ? (
                <span>Could not read collection.</span>
              ) : diffState.inSync ? (
                <span className="text-success flex items-center gap-1">
                  <Check className="w-3 h-3" /> In sync —{" "}
                  {diff.inCollection.length} item
                  {diff.inCollection.length === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-warning flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {diffState.driftCount} to review
                </span>
              )}
            </div>
          </div>
          {diffState.diffCheckedAt && (
            <p className="text-[11px] text-muted-foreground/70">
              Last checked {diffState.diffCheckedAt.toLocaleTimeString()}
              {diff?.title && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${collectionId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {diff.title}
                  </a>
                </>
              )}
              {" · "}
              <span>{diff?.trackedCount ?? 0} tracked locally</span>
            </p>
          )}
        </div>

        {/* Unified mod table — every server + collection mod in one place,
            filterable, with per-row actions applied one at a time. */}
        {diff?.ok && (
          <WorkshopItemTable
            allItems={diffState.allItems}
            filteredItems={diffState.filteredItems}
            itemFilter={diffState.itemFilter}
            setItemFilter={diffState.setItemFilter}
            itemSearch={diffState.itemSearch}
            setItemSearch={diffState.setItemSearch}
            missingCount={diffState.missingCount}
            notOnServerCount={diffState.notOnServerCount}
            trackedOnlyCount={diffState.trackedOnlyCount}
            syncedCount={diffState.syncedCount}
            rowBusy={diffState.rowBusy}
            credsConfigured={effectiveCredsConfigured}
            runRowAction={diffState.runRowAction}
            onPurge={(workshopId, name) =>
              diffState.setPurgeTarget({ workshopId, name })
            }
          />
        )}

        <WorkshopPurgeDialog
          purgeTarget={diffState.purgeTarget}
          setPurgeTarget={diffState.setPurgeTarget}
          runRowAction={diffState.runRowAction}
        />
      </CardContent>
    </Card>
  );
}
