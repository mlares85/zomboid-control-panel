import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Monitor, Palette, RotateCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTheme, type ThemeName } from "@/contexts/ThemeContext";
import { useToast } from "@/components/ui/use-toast";
import { FieldHelp } from "@/components/FieldHelp";
import { configApi } from "@/lib/api";
import { AppSettings } from "@/lib/settingsTypes";

function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <Select value={theme} onValueChange={(v) => setTheme(v as ThemeName)}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="survival">Survival (Dark)</SelectItem>
        <SelectItem value="light">Light</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AutoStartToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    configApi
      .getAutoStartStatus()
      .then((status) => {
        setSupported(status.supported);
        setEnabled(status.enabled);
      })
      .catch(() => setSupported(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !supported) return null;

  const handleToggle = async (value: boolean) => {
    setToggling(true);
    try {
      const result = await configApi.setAutoStart(value);
      setEnabled(result.enabled);
      toast({
        title: value ? "Auto-start enabled" : "Auto-start disabled",
        description: value
          ? "The panel will start automatically when you log in to Windows."
          : "The panel will no longer start automatically.",
      });
    } catch (err) {
      toast({
        title: "Failed to update auto-start",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          Startup
        </p>
        <p className="text-xs text-muted-foreground">
          Control whether the panel launches automatically.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/25 p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Start with Windows</Label>
            <FieldHelp
              description="Creates a Windows Task Scheduler entry that launches the panel when you log in."
              context="The panel runs as a normal (non-elevated) process. A console window will appear on login — close it to stop the panel."
              recommendation="safe-default"
              articleId="welcome-tour"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Launch the panel automatically when you log in.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={toggling}
          aria-label="Start panel with Windows"
        />
      </div>
    </div>
  );
}

interface GeneralSettingsProps {
  settings: AppSettings;
  originalSettings: AppSettings | null;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  isDirty: boolean;
  restarting: boolean;
  restartPanelWithReconnect: (description: string) => Promise<void>;
}

export function GeneralSettings({
  settings,
  originalSettings,
  updateSetting,
  isDirty,
  restarting,
  restartPanelWithReconnect,
}: GeneralSettingsProps) {
  return (
    <Card id="settings-general">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Panel Settings
        </CardTitle>
        <CardDescription>
          Port this panel listens on, and how it looks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="panel-port">Panel Port</Label>
            <FieldHelp
              description="The HTTP port the panel's web interface listens on."
              context="Change this if port 3001 conflicts with another service on this machine. You'll need to restart the panel and update your bookmark/URL afterward."
              recommendation="safe-default"
              articleId="welcome-tour"
            />
          </div>
          <Input
            id="panel-port"
            type="number"
            value={settings.panelPort}
            onChange={(e) => updateSetting("panelPort", e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            min="1024"
            max="65535"
            placeholder="3001"
            inputMode="numeric"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Port used to access the panel (default: 3001).
          </p>
        </div>
        {originalSettings &&
          settings.panelPort !== originalSettings.panelPort && (
            <Alert className="border-warning/40 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning">
                Restart Required
              </AlertTitle>
              <AlertDescription>
                Port changes require a restart. Save first, then restart.
              </AlertDescription>
            </Alert>
          )}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              restartPanelWithReconnect(
                `Panel is restarting on port ${settings.panelPort}. Reconnecting...`,
              )
            }
            disabled={restarting || isDirty}
            className="gap-2"
          >
            {restarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            {restarting ? "Restarting..." : "Restart Panel"}
          </Button>
          {isDirty && (
            <p className="text-xs text-muted-foreground">
              Save settings before restarting
            </p>
          )}
        </div>

        <AutoStartToggle />

        <div className="rounded-xl border border-border/70 bg-background/40 p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              Appearance
            </p>
            <p className="text-xs text-muted-foreground">
              Panel theme and visual style.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/25 p-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Label className="text-sm font-medium">Theme</Label>
                <FieldHelp
                  description="Switches the panel's color scheme between the dark 'Survival' look and a clean light theme."
                  context="Purely cosmetic — pick whichever is easier on your eyes. Applies instantly, no restart or save needed."
                  recommendation="safe-default"
                  articleId="welcome-tour"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Choose between the gritty survival look or a clean light
                theme.
              </p>
            </div>
            <ThemeSelect />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
