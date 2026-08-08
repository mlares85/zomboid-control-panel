import { Download, Key, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecoveryCodesCardProps {
  recoveryCodeStatus: {
    configured: boolean;
    remaining: number;
    total: number;
  } | null;
  generatedRecoveryCodes: string[];
  setGeneratedRecoveryCodes: (codes: string[]) => void;
  generatingRecoveryCodes: boolean;
  handleGenerateRecoveryCodes: () => Promise<void>;
}

export function RecoveryCodesCard({
  recoveryCodeStatus,
  generatedRecoveryCodes,
  setGeneratedRecoveryCodes,
  generatingRecoveryCodes,
  handleGenerateRecoveryCodes,
}: RecoveryCodesCardProps) {
  return (
    <div className="max-w-2xl rounded-xl border border-border/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Recovery codes
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Save these now while you can still sign in. If you forget the
            password, enter one on the login screen to set a new one. No
            server or file access needed.
          </p>
        </div>
        <Key className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleGenerateRecoveryCodes()}
          disabled={generatingRecoveryCodes}
        >
          {generatingRecoveryCodes ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Key className="mr-2 h-4 w-4" />
          )}
          {recoveryCodeStatus?.configured
            ? "Generate new codes"
            : "Generate recovery codes"}
        </Button>
        {recoveryCodeStatus && (
          <span className="text-xs text-muted-foreground">
            {recoveryCodeStatus.configured
              ? `${recoveryCodeStatus.remaining} of ${recoveryCodeStatus.total} unused`
              : "No codes generated yet"}
          </span>
        )}
      </div>

      {recoveryCodeStatus?.configured && (
        <p className="text-xs text-muted-foreground">
          Generating new codes replaces every existing code.
        </p>
      )}

      {generatedRecoveryCodes.length > 0 && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="text-xs font-medium text-warning">
            Copy these now. They are shown once and cannot be retrieved
            later.
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {generatedRecoveryCodes.map((code) => (
              <code
                key={code}
                className="rounded bg-background/70 px-2 py-1 font-mono text-xs tracking-wider"
              >
                {code}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const blob = new Blob(
                  [
                    `Zomboid Control Panel recovery codes\nGenerated: ${new Date().toISOString()}\nEach code works once.\n\n${generatedRecoveryCodes.join("\n")}\n`,
                  ],
                  { type: "text/plain" },
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "zomboid-panel-recovery-codes.txt";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1500);
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setGeneratedRecoveryCodes([])}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
