import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { useSocket } from "@/contexts/SocketContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettingsCore } from "@/hooks/settings/useAppSettingsCore";
import { useCorsSettings } from "@/hooks/settings/useCorsSettings";
import { usePanelUpdateSettings } from "@/hooks/settings/usePanelUpdateSettings";
import { normalizePort } from "@/lib/settingsFormat";
import { SETTINGS_SECTIONS, resolveSettingsTabId } from "@/lib/settingsSections";
import { SettingsTabList } from "@/components/settings/SettingsTabList";
import { SettingsTabPanels } from "@/components/settings/SettingsTabPanels";
import { SettingsUnsavedBanner } from "@/components/settings/SettingsUnsavedBanner";
import { CorsLockoutDialog } from "@/components/settings/CorsLockoutDialog";

export default function Settings() {
  const socket = useSocket();
  const { user, authEnabled, logout } = useAuth();

  // Refreshing CORS diagnostics after a save is best-effort UI polish that
  // spans two hooks; a ref avoids a circular dependency between them (core
  // needs a callback before `cors` exists, `cors` needs `settings` from core).
  const onSavedRef = useRef<() => Promise<void>>(async () => {});
  const core = useAppSettingsCore(socket, { onSaved: () => onSavedRef.current() });
  const cors = useCorsSettings(core.settings, core.updateSetting);
  onSavedRef.current = cors.fetchCorsDiagnostics;
  const panelUpdate = usePanelUpdateSettings(socket);

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState(
    () => resolveSettingsTabId(searchParams.get("tab")) ?? "general",
  );
  const handleTabChange = (value: string) => {
    setActiveSection(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  const https = buildHttpsPreview(core.settings, core.updateSetting);

  if (core.loading && !core.originalSettings) {
    return (
      <div className="flex items-center justify-center min-h-[320px] py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-transition">
      <SettingsUnsavedBanner
        isDirty={core.isDirty}
        saving={core.saving}
        corsOriginValidationError={core.corsOriginValidationError}
        handleSave={core.handleSave}
      />

      <PageHeader
        title="Settings"
        description={
          SETTINGS_SECTIONS.find((s) => s.id === activeSection)?.description ??
          "Panel port, remote access, server integrations, backups, and security."
        }
        eyebrow="Configuration"
        tone="config"
        icon={<Settings2 className="w-5 h-5" />}
        actions={
          <Button
            variant="command"
            onClick={core.handleSave}
            disabled={
              core.saving || !core.isDirty || Boolean(core.corsOriginValidationError)
            }
            size="lg"
            className="w-full sm:w-auto gap-2"
          >
            {core.saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {core.saving ? "Saving..." : core.isDirty ? "Save Settings" : "No Unsaved Changes"}
          </Button>
        }
      />

      <Tabs
        value={activeSection}
        onValueChange={handleTabChange}
        className="mt-6 lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:items-start lg:gap-7"
      >
        <SettingsTabList />
        <div className="space-y-5">
          <SettingsTabPanels
            socket={socket}
            core={core}
            cors={cors}
            panelUpdate={panelUpdate}
            https={https}
            authEnabled={authEnabled}
            user={user}
            logout={logout}
          />
        </div>
      </Tabs>

      <CorsLockoutDialog
        open={cors.pendingCorsLanDisable}
        onOpenChange={cors.setPendingCorsLanDisable}
        onConfirmDisable={() => {
          core.updateSetting("corsAllowPrivateNetworks", false);
          cors.setPendingCorsLanDisable(false);
        }}
      />
    </div>
  );
}

// Derived HTTPS preview values (URLs, cert-path warnings) recomputed from
// the live settings each render — cheap, so no memoization needed.
function buildHttpsPreview(
  settings: ReturnType<typeof useAppSettingsCore>["settings"],
  updateSetting: ReturnType<typeof useAppSettingsCore>["updateSetting"],
) {
  const trimmedHttpsKeyPath = settings.httpsKeyPath.trim();
  const trimmedHttpsCertPath = settings.httpsCertPath.trim();
  const httpsPortPreview = normalizePort(settings.httpsPort || "3443");
  const httpPortPreview = normalizePort(settings.panelPort || "3001");

  return {
    applyRecommendedHttpsDefaults: () => {
      updateSetting("httpsEnabled", true);
      updateSetting("httpsPort", "3443");
      updateSetting("httpsKeyPath", "");
      updateSetting("httpsCertPath", "");
    },
    hasPartialHttpsCertPath:
      Boolean(trimmedHttpsKeyPath) !== Boolean(trimmedHttpsCertPath),
    usingAutoGeneratedHttpsCert:
      settings.httpsEnabled && !trimmedHttpsKeyPath && !trimmedHttpsCertPath,
    httpPreviewUrl: `http://${window.location.hostname}:${httpPortPreview}`,
    httpsPreviewUrl: `https://${window.location.hostname}:${httpsPortPreview}`,
  };
}
