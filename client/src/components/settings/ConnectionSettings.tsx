import { Link, Loader2, Server } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { AppSettings } from "@/lib/settingsTypes";
import { useConnectionSettings } from "@/hooks/settings/useConnectionSettings";

interface ConnectionSettingsProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
}

export function ConnectionSettings({
  settings,
  updateSetting,
}: ConnectionSettingsProps) {
  const { testingRcon, handleTestRcon } = useConnectionSettings();
  return (
    <>
      <Card id="settings-rcon">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Link className="w-4 h-4 text-primary" />
            RCON Connection
          </CardTitle>
          <CardDescription>
            Test the connection and set reconnect behavior. Host, port, and
            password are configured per-server on the Servers page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button
              variant="outline"
              onClick={handleTestRcon}
              disabled={testingRcon}
              className="w-full sm:w-auto"
            >
              {testingRcon ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Test Connection
            </Button>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.autoReconnect}
                onCheckedChange={(value) =>
                  updateSetting("autoReconnect", value)
                }
                aria-label="Auto-reconnect RCON on disconnect"
              />
              <Label>Auto-reconnect on disconnect</Label>
            </div>
          </div>
          {settings.autoReconnect && (
            <div className="max-w-xs">
              <Label htmlFor="reconnect-interval">
                Reconnect Interval (seconds)
              </Label>
              <Input
                id="reconnect-interval"
                type="number"
                value={settings.reconnectInterval}
                onChange={(e) =>
                  updateSetting("reconnectInterval", e.target.value)
                }
                onWheel={(e) => e.currentTarget.blur()}
                min="1"
                max="60"
                inputMode="numeric"
              />
            </div>
          )}
          <div className="p-4 bg-muted rounded-xl text-sm">
            <p className="font-medium mb-2">RCON is configured per-server:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Go to <strong>Servers</strong> page
              </li>
              <li>
                Click <strong>Edit</strong> on your server
              </li>
              <li>Configure RCON host, port, and password there</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card id="settings-server-startup">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Server Startup
          </CardTitle>
          <CardDescription>
            Whether the panel launches the game server for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/25 p-3">
            <div className="space-y-1">
              <Label htmlFor="auto-start-server" className="text-sm font-medium">
                Start the game server when the panel starts
              </Label>
              <p className="text-xs text-muted-foreground">
                Skipped automatically when the RCON port is already in use,
                so a server that is already running is never duplicated.
                Needs a local install path; servers hosted by a provider are
                started by the provider.
              </p>
            </div>
            <Switch
              id="auto-start-server"
              checked={settings.autoStartServer}
              onCheckedChange={(value) =>
                updateSetting("autoStartServer", value)
              }
              aria-label="Start the game server when the panel starts"
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
