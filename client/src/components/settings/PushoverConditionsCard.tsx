import { Loader2, Plus, RotateCcw, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { usePushoverConditions } from "@/hooks/settings/usePushoverConditions";
import { PushoverConditionRow } from "./PushoverConditionRow";

type PushoverConditions = ReturnType<typeof usePushoverConditions>;

/** List of alert conditions that trigger a Pushover notification, with add/reset/save actions. */
export function PushoverConditionsCard({
  conditions,
  loading,
  saving,
  resetting,
  updateCondition,
  removeCondition,
  addCondition,
  handleSave,
  handleReset,
}: PushoverConditions) {
  return (
    <Card id="settings-pushover-conditions">
      <CardHeader className="pb-4">
        <CardTitle>Alert Conditions</CardTitle>
        <CardDescription>
          Each condition sends a Pushover notification when its threshold is crossed, then waits out
          its cooldown before alerting again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : conditions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            No alert conditions configured yet.
          </p>
        ) : (
          <div className="space-y-3">
            {conditions.map((condition) => (
              <PushoverConditionRow
                key={condition.id}
                condition={condition}
                onChange={(patch) => updateCondition(condition.id, patch)}
                onRemove={() => removeCondition(condition.id)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <Button variant="outline" size="sm" onClick={addCondition} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add Condition
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting} className="gap-2">
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loading} className="ml-auto gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save Conditions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
