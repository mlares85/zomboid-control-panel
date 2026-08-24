import { Loader2, Save, Send } from "lucide-react";
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
import type { usePushoverSettings } from "@/hooks/settings/usePushoverSettings";

type PushoverConfig = ReturnType<typeof usePushoverSettings>;

/** User Key / API Token pair for the Pushover app, plus Test and Save actions. */
export function PushoverConfigCard({
  settings,
  loading,
  saving,
  testing,
  updateField,
  handleSave,
  handleTest,
}: PushoverConfig) {
  const canTest = Boolean(settings.userKey && settings.apiToken);

  return (
    <Card id="settings-pushover-config">
      <CardHeader className="pb-4">
        <CardTitle>Pushover</CardTitle>
        <CardDescription>
          Send push notifications to your phone or desktop when alert conditions trigger. Requires a
          free Pushover account and application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pushover-user-key">User Key</Label>
          <Input
            id="pushover-user-key"
            value={settings.userKey}
            onChange={(e) => updateField("userKey", e.target.value)}
            placeholder="u1a2b3c4d5e6f7g8h9i0j"
            className="font-mono"
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pushover-api-token">API Token</Label>
          <Input
            id="pushover-api-token"
            type="password"
            value={settings.apiToken}
            onChange={(e) => updateField("apiToken", e.target.value)}
            placeholder="a1b2c3d4e5f6g7h8i9j0k"
            className="font-mono"
            disabled={loading}
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            onClick={handleTest}
            variant="outline"
            disabled={testing || loading || !canTest}
            className="gap-2"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {testing ? "Sending…" : "Send Test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
