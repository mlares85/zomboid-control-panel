import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PushoverCondition } from "@/lib/api";

const METRICS: Array<{ value: PushoverCondition["metric"]; label: string }> = [
  { value: "cpu", label: "CPU usage" },
  { value: "memory", label: "Memory usage" },
  { value: "disk", label: "Disk usage" },
  { value: "playerCount", label: "Player count" },
  { value: "serverOffline", label: "Server offline" },
  { value: "bridgeOffline", label: "Bridge offline" },
];

const OPERATORS: Array<PushoverCondition["operator"]> = [">", ">=", "<", "<=", "=="];

const SEVERITIES: Array<PushoverCondition["severity"]> = ["low", "normal", "high", "emergency"];

interface PushoverConditionRowProps {
  condition: PushoverCondition;
  onChange: (patch: Partial<PushoverCondition>) => void;
  onRemove: () => void;
}

/** One editable alert-condition row: metric, operator, threshold, severity, cooldown, enabled. */
export function PushoverConditionRow({ condition, onChange, onRemove }: PushoverConditionRowProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={condition.enabled}
            onCheckedChange={(value) => onChange({ enabled: value })}
            aria-label="Enable condition"
          />
          <span className="text-xs text-muted-foreground">
            {condition.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Metric</Label>
          <Select value={condition.metric} onValueChange={(value) => onChange({ metric: value as PushoverCondition["metric"] })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Operator</Label>
          <Select value={condition.operator} onValueChange={(value) => onChange({ operator: value as PushoverCondition["operator"] })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Threshold</Label>
          <Input
            type="number"
            value={condition.threshold}
            onChange={(e) => onChange({ threshold: Number(e.target.value) || 0 })}
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Cooldown (min)</Label>
          <Input
            type="number"
            min={0}
            value={condition.cooldownMinutes}
            onChange={(e) => onChange({ cooldownMinutes: Number(e.target.value) || 0 })}
            className="h-9"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Severity</Label>
        <Select value={condition.severity} onValueChange={(value) => onChange({ severity: value as PushoverCondition["severity"] })}>
          <SelectTrigger className="h-9 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
