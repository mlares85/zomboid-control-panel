import { AlertTriangle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SettingsUnsavedBannerProps {
  isDirty: boolean;
  saving: boolean;
  corsOriginValidationError: string | null;
  handleSave: () => Promise<void>;
}

export function SettingsUnsavedBanner({
  isDirty,
  saving,
  corsOriginValidationError,
  handleSave,
}: SettingsUnsavedBannerProps) {
  if (!isDirty) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative mb-5 overflow-hidden rounded-lg border border-warning/45 bg-warning/[0.08] shadow-sm"
    >
      <div
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-warning via-warning/80 to-warning/30"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-warning/40 bg-warning/15 text-warning">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex w-2 h-2" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-warning/50 animate-ping motion-reduce:hidden" />
                <span className="relative w-2 h-2 rounded-full bg-warning" />
              </span>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-warning">
                Unsaved changes
              </p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              You have pending edits. Save changes to apply them to the live
              panel.
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || Boolean(corsOriginValidationError)}
          size="sm"
          variant="warning"
          className="self-start gap-2 sm:self-auto"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
