import { AlertTriangle, Check, Cloud, ExternalLink, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface WorkshopCookiePasteHelperProps {
  savingCookies: boolean;
  pasteOpen: boolean;
  setPasteOpen: (value: boolean) => void;
  pasteText: string;
  setPasteText: (value: string) => void;
  pasteError: string | null;
  setPasteError: (value: string | null) => void;
  clipboardReadAvailable: boolean;
  handlePasteApply: () => Promise<void>;
  handlePasteFromClipboard: () => Promise<void>;
}

// "Paste a Steam request" fallback for capturing session cookies when
// browser auto-detect isn't available or doesn't find a match.
export function WorkshopCookiePasteHelper({
  savingCookies,
  pasteOpen,
  setPasteOpen,
  pasteText,
  setPasteText,
  pasteError,
  setPasteError,
  clipboardReadAvailable,
  handlePasteApply,
  handlePasteFromClipboard,
}: WorkshopCookiePasteHelperProps) {
  return (
    <div className="border-t border-border/40 pt-4 space-y-3">
      <div className="flex items-start gap-3">
        <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="font-medium text-sm">Quick setup: paste a Steam request</p>
          <p className="text-xs text-muted-foreground">
            Steam marks <code>steamLoginSecure</code> as HttpOnly, so the
            cookies tab works but a one-click button can't read it. Easiest
            path: copy any logged-in Steam request and let us extract the
            cookies.
          </p>
          <p className="text-xs text-muted-foreground">
            Prefer a cookie exporter?{" "}
            <a
              href="https://github.com/kairi003/Get-cookies.txt-LOCALLY"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Get cookies.txt LOCALLY
              <ExternalLink className="w-3 h-3" />
            </a>{" "}
            (Chrome/Firefox, open source) works well on Steam. Open{" "}
            <code>steamcommunity.com</code> while signed in, click its icon,
            copy, and paste the result below — both its <em>Netscape</em> and{" "}
            <em>Header String</em> formats are understood.
          </p>
        </div>
      </div>

      {!pasteOpen ? (
        <div className="flex flex-wrap gap-2">
          {clipboardReadAvailable && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handlePasteFromClipboard}
              disabled={savingCookies}
            >
              <Cloud className="w-3.5 h-3.5 mr-1.5" />
              Paste from clipboard
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={clipboardReadAvailable ? "outline" : "default"}
            onClick={() => {
              setPasteOpen(true);
              setPasteError(null);
            }}
          >
            {clipboardReadAvailable ? "Paste manually…" : "Paste cookies…"}
          </Button>
          <a
            href="https://steamcommunity.com/my/myworkshopfiles/?section=collections"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline self-center"
          >
            Open Steam collections <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPasteError(null);
            }}
            placeholder='Paste a "Copy as cURL" command, a Cookie header, a cookies.txt export, or "sessionid=...; steamLoginSecure=..."'
            rows={4}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handlePasteApply}
              disabled={!pasteText.trim() || savingCookies}
            >
              {savingCookies ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1.5" />
              )}
              {savingCookies ? "Saving…" : "Extract & save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPasteOpen(false);
                setPasteText("");
                setPasteError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {pasteError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {pasteError}
            </p>
          )}
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          How to get a Steam request to copy
        </summary>
        <ol className="list-decimal list-inside mt-2 space-y-1 text-muted-foreground pl-1">
          <li>
            Open{" "}
            <a
              href="https://steamcommunity.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              steamcommunity.com
            </a>{" "}
            in your browser, logged in.
          </li>
          <li>
            Press{" "}
            <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px]">
              F12
            </kbd>{" "}
            → <strong>Network</strong> tab.
          </li>
          <li>Reload the page so requests show up.</li>
          <li>
            Right-click <em>any</em> request → <strong>Copy</strong> →{" "}
            <strong>Copy as cURL</strong>.
          </li>
          <li>
            Come back here and click <strong>Paste from clipboard</strong>.
          </li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          Or, if you prefer the manual route: F12 → <strong>Application</strong>{" "}
          → <strong>Cookies</strong> →
          <code className="mx-1">https://steamcommunity.com</code>, copy{" "}
          <code>sessionid</code> and <code>steamLoginSecure</code>
          into the fields above directly.
        </p>
      </details>

      <p className="text-[11px] text-warning/90 flex items-start gap-1 pt-1 border-t border-border/30">
        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          These cookies grant Steam login access — treat them like a
          password. Steam rotates the token every few weeks, so you'll need
          to re-paste when sync starts failing.
        </span>
      </p>
    </div>
  );
}
