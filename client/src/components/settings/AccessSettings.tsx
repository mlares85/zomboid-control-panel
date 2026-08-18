import { AlertTriangle, Globe } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSettings, CorsDiagnostics } from "@/lib/settingsTypes";
import { FieldHelp } from "@/components/FieldHelp";
import { CorsDiagnosticsPanel } from "./CorsDiagnosticsPanel";

interface AccessSettingsProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  networkInterfaces: { name: string; address: string }[];
  corsOriginValidationError: string | null;
  corsDiagnostics: CorsDiagnostics | null;
  corsLoading: boolean;
  corsUpdating: boolean;
  saving: boolean;
  handleCorsLanToggle: (value: boolean) => void;
  handleReloadCorsRules: () => Promise<void>;
  fetchCorsDiagnostics: () => Promise<void>;
  handleClearCorsBlocked: () => Promise<void>;
}

export function AccessSettings({
  settings,
  updateSetting,
  networkInterfaces,
  corsOriginValidationError,
  corsDiagnostics,
  corsLoading,
  corsUpdating,
  saving,
  handleCorsLanToggle,
  handleReloadCorsRules,
  fetchCorsDiagnostics,
  handleClearCorsBlocked,
}: AccessSettingsProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Remote Access (CORS)</p>
        <p className="text-xs text-muted-foreground">
          Controls which devices and browsers can connect to this panel. If
          you only access the panel from this machine, these defaults are
          fine.
        </p>
      </div>

      <Alert className="border-border/60 bg-muted/40">
        <Globe className="h-4 w-4 text-primary" />
        <AlertTitle>Quick Start for VPS Remote Access</AlertTitle>
        <AlertDescription className="space-y-1 text-sm text-muted-foreground">
          <p>
            1. Keep{" "}
            <strong className="text-foreground">
              Allow private/LAN origins
            </strong>{" "}
            on.
          </p>
          <p>
            2. Add one origin per line in the list below (example:{" "}
            <code>http://YOUR_PUBLIC_IP:3001</code>).
          </p>
          <p>
            3. Save settings, then click{" "}
            <strong className="text-foreground">Reload CORS Rules</strong>.
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/25 p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">
              Allow Private/LAN Origins
            </Label>
            <FieldHelp
              description="Automatically trusts browser requests coming from localhost and private/LAN IP ranges."
              context="Keep this on for typical home/LAN setups. Turning it off can lock you out of the panel from other devices on your network until you add their origin manually below."
              recommendation="safe-default"
              articleId="first-run-checklist"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Automatically allow connections from localhost and private/LAN IP
            ranges.
          </p>
        </div>
        <Switch
          checked={settings.corsAllowPrivateNetworks}
          onCheckedChange={handleCorsLanToggle}
          aria-label="Allow private and LAN origins"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/25 p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">
              Show Public IP Address
            </Label>
            <FieldHelp
              description="Looks up and displays this machine's public IP address on the dashboard."
              context="Purely cosmetic convenience for sharing your server's address with players. Off by default to avoid the external lookup call and minor privacy leak for LAN-only setups."
              recommendation="safe-default"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Look up this machine's public IP (via api.ipify.org) to display
            on the dashboard. Off by default — an unnecessary external
            dependency and small privacy leak for LAN-only setups. The
            result is cached, so this calls out at most once per restart.
          </p>
        </div>
        <Switch
          checked={settings.enablePublicIpLookup}
          onCheckedChange={(value) =>
            updateSetting("enablePublicIpLookup", value)
          }
          aria-label="Enable public IP lookup"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/25 p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Dashboard LAN Address</Label>
            <FieldHelp
              description="Which of this machine's network interface addresses the dashboard displays to you."
              context="Display-only — has no effect on CORS or who can actually connect. Auto-detect works for most single-NIC setups; pick manually if you run Tailscale, ZeroTier, or multiple network adapters."
              recommendation="safe-default"
              articleId="server-config-deep-dive"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Which network interface's address the dashboard shows. Useful
            when this host has more than one, e.g. Tailscale and ZeroTier at
            once — pick the one you actually want to share with players.
          </p>
        </div>
        <Select
          value={settings.lanIpAddress || "auto"}
          onValueChange={(value) =>
            updateSetting("lanIpAddress", value === "auto" ? "" : value)
          }
        >
          <SelectTrigger aria-label="Dashboard LAN address">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect (default)</SelectItem>
            {networkInterfaces.map((iface) => (
              <SelectItem key={iface.address} value={iface.address}>
                {iface.name} — {iface.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="cors-origins">Additional Allowed Origins</Label>
          <FieldHelp
            description="Extra browser origins (scheme + host + port) allowed to connect to the panel, beyond the auto-trusted LAN ranges."
            context="Required for accessing the panel from outside your LAN — e.g. a VPS public IP or a domain name. Must exactly match what's in your browser's address bar, including http:// or https://."
            recommendation="must-configure"
            articleId="server-config-deep-dive"
          />
        </div>
        <Textarea
          id="cors-origins"
          value={settings.corsAllowedOrigins}
          onChange={(e) => updateSetting("corsAllowedOrigins", e.target.value)}
          placeholder={"http://123.45.67.89:3001\nhttps://panel.example.com"}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          One address per line, including http:// or https:// and port if
          needed.
        </p>
        {corsOriginValidationError && (
          <p className="text-xs text-destructive">
            {corsOriginValidationError}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-warning">
              Allow All Origins (Debug Only)
            </Label>
            <FieldHelp
              description="Disables browser-origin checks entirely, letting any website's requests reach the panel."
              context="Removes a real security boundary — only use it briefly to diagnose a CORS problem, then turn it back off. Never leave enabled on a panel reachable from the internet."
              recommendation="advanced"
              articleId="server-config-deep-dive"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Skip all origin checks — useful for diagnosing connection
            problems.
          </p>
        </div>
        <Switch
          checked={settings.corsAllowAll}
          onCheckedChange={(value) => updateSetting("corsAllowAll", value)}
          aria-label="Allow all origins"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/25 p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">
              Enable CORS Debug Logging
            </Label>
            <FieldHelp
              description="Logs each connection attempt that gets blocked by an origin check, with the reason why."
              context="Safe to leave on or off — it only affects logging, not behavior. Turn it on temporarily when troubleshooting why a device can't reach the panel."
              recommendation="safe-default"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Log blocked connection attempts for troubleshooting.
          </p>
        </div>
        <Switch
          checked={settings.corsDebug}
          onCheckedChange={(value) => updateSetting("corsDebug", value)}
          aria-label="Enable CORS debug logging"
        />
      </div>

      {settings.corsAllowAll && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">Security Warning</AlertTitle>
          <AlertDescription>
            Allowing all origins removes browser-origin protection. Use this
            only for short troubleshooting windows.
          </AlertDescription>
        </Alert>
      )}

      <CorsDiagnosticsPanel
        corsOriginValidationError={corsOriginValidationError}
        corsDiagnostics={corsDiagnostics}
        corsLoading={corsLoading}
        corsUpdating={corsUpdating}
        saving={saving}
        handleReloadCorsRules={handleReloadCorsRules}
        fetchCorsDiagnostics={fetchCorsDiagnostics}
        handleClearCorsBlocked={handleClearCorsBlocked}
      />
    </div>
  );
}
