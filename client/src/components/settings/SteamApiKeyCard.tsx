import { useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Key } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHelp } from "@/components/FieldHelp";
import { AppSettings } from "@/lib/settingsTypes";

interface SteamApiKeyCardProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
}

export function SteamApiKeyCard({ settings, updateSetting }: SteamApiKeyCardProps) {
  const [showSteamApiKey, setShowSteamApiKey] = useState(false);

  return (
    <Card id="settings-api-keys">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          API Keys
        </CardTitle>
        <CardDescription>
          Keys used for Steam Workshop lookups and the server finder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor="steam-api-key" className="text-base">
              Steam Web API Key
            </Label>
            <FieldHelp
              description="Your personal Steam Web API key, used for Workshop mod lookups and the server finder."
              context="Required for the panel to fetch mod names, previews, and update info from Steam. Get a free key from your Steam account — it never expires unless you regenerate it."
              recommendation="must-configure"
              articleId="mod-manager-basics"
            />
            {/* Configured indicator — the API masks the value as
            "••••••••XXXX" when set, so the presence of the bullets is a
            reliable signal that a key is stored on the server. */}
            {settings.steamApiKey && settings.steamApiKey.startsWith("•") ? (
              <span className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                <Check className="w-3 h-3" aria-hidden="true" /> Configured
              </span>
            ) : settings.steamApiKey ? (
              <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Pending save
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                Not configured
              </span>
            )}
          </div>
          <div className="relative max-w-md">
            <Input
              id="steam-api-key"
              type={showSteamApiKey ? "text" : "password"}
              value={settings.steamApiKey}
              onChange={(e) => updateSetting("steamApiKey", e.target.value)}
              placeholder="Your Steam API key"
              className="h-11 pr-10"
              maxLength={128}
            />
            <button
              type="button"
              onClick={() => setShowSteamApiKey(!showSteamApiKey)}
              className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
              aria-label={showSteamApiKey ? "Hide API key" : "Show API key"}
            >
              {showSteamApiKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Used for Steam Workshop mod information and server finder
            features.
          </p>
          <div className="p-4 bg-muted rounded-xl text-sm mt-3">
            <p className="font-medium mb-2">How to get a Steam API Key:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Go to{" "}
                <a
                  href="https://steamcommunity.com/dev/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Steam API Key Registration{" "}
                  <span className="sr-only">(opens in new tab)</span>
                </a>
              </li>
              <li>Log in with your Steam account</li>
              <li>Enter a domain name (can be "localhost" for personal use)</li>
              <li>Copy the key and paste it here</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
