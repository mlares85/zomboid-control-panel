import { Check, Eye, EyeOff, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modsApi } from "@/lib/api";
import { AppSettings } from "@/lib/settingsTypes";
import { WorkshopCookiePasteHelper } from "./WorkshopCookiePasteHelper";

type Browsers = Awaited<ReturnType<typeof modsApi.collectionBrowsers>>;

interface WorkshopCookiesSectionProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  credsConfigured: boolean;
  browsers: Browsers | null;
  extractingFrom: string | null;
  savingCookies: boolean;
  showCookies: boolean;
  setShowCookies: (value: boolean) => void;
  pasteOpen: boolean;
  setPasteOpen: (value: boolean) => void;
  pasteText: string;
  setPasteText: (value: string) => void;
  pasteError: string | null;
  setPasteError: (value: string | null) => void;
  clipboardReadAvailable: boolean;
  handlePasteApply: () => Promise<void>;
  handlePasteFromClipboard: () => Promise<void>;
  handleAutoExtract: (browserId: string, label: string) => Promise<void>;
}

export function WorkshopCookiesSection({
  settings,
  updateSetting,
  credsConfigured,
  browsers,
  extractingFrom,
  savingCookies,
  showCookies,
  setShowCookies,
  pasteOpen,
  setPasteOpen,
  pasteText,
  setPasteText,
  pasteError,
  setPasteError,
  clipboardReadAvailable,
  handlePasteApply,
  handlePasteFromClipboard,
  handleAutoExtract,
}: WorkshopCookiesSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-base">Steam Session Cookies</Label>
          {credsConfigured ? (
            <span className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
              <Check className="w-3 h-3" /> Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Not configured
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCookies(!showCookies)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {showCookies ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          {showCookies ? "Hide" : "Show"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Required to <strong>write</strong> to the collection. Reading is free
        without these.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 max-w-3xl">
        <div className="space-y-1">
          <Label htmlFor="ws-sessionid" className="text-xs text-muted-foreground">
            sessionid
          </Label>
          <Input
            id="ws-sessionid"
            type={showCookies ? "text" : "password"}
            value={settings.steamSessionId}
            onChange={(e) =>
              updateSetting("steamSessionId", e.target.value.trim())
            }
            placeholder="24-char hex from cookie"
            className="h-10 font-mono"
            maxLength={64}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ws-loginsecure" className="text-xs text-muted-foreground">
            steamLoginSecure
          </Label>
          <Input
            id="ws-loginsecure"
            type={showCookies ? "text" : "password"}
            value={settings.steamLoginSecure}
            onChange={(e) =>
              updateSetting("steamLoginSecure", e.target.value.trim())
            }
            placeholder="long token from cookie"
            className="h-10 font-mono"
            maxLength={512}
          />
        </div>
      </div>
      {/* Auto-detect from local browser — fastest path when Steam is logged
          in on the same machine the panel runs on. */}
      {browsers && browsers.supported && browsers.browsers.some((b) => b.detected) && (
        <div className="border-t border-border/40 pt-4 space-y-3">
          <div className="flex items-start gap-3">
            <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">
                Auto-detect from this machine's browser
              </p>
              <p className="text-xs text-muted-foreground">
                Reads cookies directly from a browser installed on the panel
                host. Works for browsers logged into Steam on{" "}
                <strong>this machine</strong>. Close the browser first for
                best results.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {browsers.browsers
              .filter((b) => b.detected)
              .map((b) => (
                <Button
                  key={b.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!!extractingFrom}
                  onClick={() => handleAutoExtract(b.id, b.label)}
                >
                  {extractingFrom === b.id ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {b.label}
                </Button>
              ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Chrome 127+ may seal <code>steamLoginSecure</code> away from this
            method (App-Bound Encryption). Paste a Steam request if
            extraction returns nothing.
          </p>
        </div>
      )}

      <WorkshopCookiePasteHelper
        savingCookies={savingCookies}
        pasteOpen={pasteOpen}
        setPasteOpen={setPasteOpen}
        pasteText={pasteText}
        setPasteText={setPasteText}
        pasteError={pasteError}
        setPasteError={setPasteError}
        clipboardReadAvailable={clipboardReadAvailable}
        handlePasteApply={handlePasteApply}
        handlePasteFromClipboard={handlePasteFromClipboard}
      />
    </div>
  );
}
