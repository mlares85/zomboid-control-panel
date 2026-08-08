import { useEffect, useState } from "react";
import { modsApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { AppSettings } from "@/lib/settingsTypes";

type PersistCookies = (
  cookies: Pick<AppSettings, "steamSessionId" | "steamLoginSecure">,
) => Promise<void>;

// Steam session cookie capture for Workshop Collection Sync: browser
// auto-detect, and the "paste a Steam request" fallback parser.
//
// `steamLoginSecure` is HttpOnly, so a bookmarklet on steamcommunity.com
// cannot read it (Steam set it that way on purpose). The least-painful
// workaround is: user opens DevTools → Network → right-clicks any request
// to steamcommunity.com → "Copy as cURL", and pastes the whole blob here.
// We extract the two cookie values from the `Cookie:` header.
export function useWorkshopCookies(
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void,
  persistCookies: PersistCookies,
) {
  const { toast } = useToast();
  const [browsers, setBrowsers] = useState<Awaited<
    ReturnType<typeof modsApi.collectionBrowsers>
  > | null>(null);
  const [extractingFrom, setExtractingFrom] = useState<string | null>(null);
  const [savingCookies, setSavingCookies] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  // navigator.clipboard.readText() requires a secure context. The panel
  // commonly runs over plain HTTP on LAN, where the API is undefined.
  // Detect once at mount so we can hide the button instead of showing a
  // confusing failure when the user clicks it.
  const clipboardReadAvailable =
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.readText === "function" &&
    (window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  // Probe which local browsers we can read cookies from. Cheap, just a
  // filesystem check on the panel host. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    modsApi
      .collectionBrowsers()
      .then((r) => {
        if (!cancelled) setBrowsers(r);
      })
      .catch(() => {
        /* not fatal — the section just won't appear */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const safeDecode = (v: string): string => {
    // decodeURIComponent throws on stray `%` (e.g. paste contained a
    // mid-rotation cookie). Fall back to the raw value rather than
    // crashing the parse.
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };

  const parseCookieBlob = (
    raw: string,
  ): { sessionId?: string; loginSecure?: string; error?: string } => {
    if (!raw || !raw.trim()) return { error: "Nothing to parse" };
    const text = raw.replace(/\r/g, "");
    // Accept any of: full cURL command, raw `Cookie:` header line, a
    // `sessionid=...; steamLoginSecure=...` snippet, DevTools "Copy →
    // Response Cookies" tab-separated values, or a Netscape cookies.txt
    // export (name and value separated by a tab).
    const sessionMatch = text.match(
      /(?:^|[;\s'"])sessionid\s*[=:\t]\s*([A-Za-z0-9_%-]+)/i,
    );
    const loginMatch = text.match(
      /(?:^|[;\s'"])steamLoginSecure\s*[=:\t]\s*([A-Za-z0-9_%|+/=.-]+)/i,
    );
    if (!sessionMatch && !loginMatch) {
      return { error: "No sessionid or steamLoginSecure found in pasted text" };
    }
    const result: { sessionId?: string; loginSecure?: string } = {};
    if (sessionMatch) result.sessionId = safeDecode(sessionMatch[1]);
    if (loginMatch) result.loginSecure = safeDecode(loginMatch[1]);
    return result;
  };

  const saveExtractedCookies = async (
    sessionId: string,
    loginSecure: string,
  ) => {
    setSavingCookies(true);
    try {
      await persistCookies({
        steamSessionId: sessionId,
        steamLoginSecure: loginSecure,
      });
      toast({
        title: "Cookies saved",
        description: "Your Steam session is ready for collection sync.",
        variant: "success" as const,
      });
      return true;
    } catch (error) {
      setPasteError(
        error instanceof Error
          ? error.message
          : "Could not save cookies. Try again.",
      );
      return false;
    } finally {
      setSavingCookies(false);
    }
  };

  const handlePasteApply = async () => {
    setPasteError(null);
    const parsed = parseCookieBlob(pasteText);
    if (parsed.error) {
      setPasteError(parsed.error);
      return;
    }
    if (!parsed.sessionId && !parsed.loginSecure) {
      setPasteError("Nothing usable found");
      return;
    }
    const { sessionId, loginSecure } = parsed;
    if (sessionId && loginSecure) {
      if (await saveExtractedCookies(sessionId, loginSecure)) {
        setPasteText("");
        setPasteOpen(false);
      }
      return;
    }
    if (parsed.sessionId) updateSetting("steamSessionId", parsed.sessionId);
    if (parsed.loginSecure) updateSetting("steamLoginSecure", parsed.loginSecure);
    toast({
      title: "Partial extraction",
      description: `Only ${parsed.sessionId ? "sessionid" : "steamLoginSecure"} found — paste a request that includes both, or fill the other field manually.`,
      variant: "destructive",
    });
    setPasteText("");
    setPasteOpen(false);
  };

  const handlePasteFromClipboard = async () => {
    setPasteError(null);
    if (!clipboardReadAvailable) {
      setPasteOpen(true);
      setPasteError(
        "Clipboard read needs HTTPS or localhost. Use manual paste below.",
      );
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setPasteOpen(true);
        setPasteError("Clipboard is empty");
        return;
      }
      const parsed = parseCookieBlob(text);
      const { sessionId, loginSecure } = parsed;
      if (sessionId && loginSecure) {
        if (await saveExtractedCookies(sessionId, loginSecure)) {
          setPasteText("");
          setPasteOpen(false);
        }
        return;
      }
      // Partial / no match: surface the textarea so the user can see what
      // was pasted and either fix it or grab the missing piece manually.
      setPasteText(text);
      setPasteOpen(true);
      setPasteError(
        parsed.error ||
          "Couldn’t find both cookies in the clipboard. Paste a request that includes them.",
      );
    } catch (err: any) {
      setPasteOpen(true);
      setPasteError(
        err?.message || "Could not read clipboard. Paste manually instead.",
      );
    }
  };

  const handleAutoExtract = async (browserId: string, label: string) => {
    if (extractingFrom) return;
    setExtractingFrom(browserId);
    try {
      const r = await modsApi.collectionExtractCookies(browserId);
      if (r.ok && r.sessionid && r.steamLoginSecure) {
        const saved = await saveExtractedCookies(r.sessionid, r.steamLoginSecure);
        if (saved && r.notes && r.notes.length > 0) {
          toast({ title: `Cookies extracted from ${label}`, description: r.notes[0] });
        }
      } else {
        toast({
          variant: "destructive",
          title: `Couldn't extract from ${label}`,
          description: r.error || "Unknown failure",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: `Couldn't extract from ${label}`,
        description: err?.message || "Request failed",
      });
    } finally {
      setExtractingFrom(null);
    }
  };

  return {
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
  };
}
