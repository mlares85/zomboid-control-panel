import { Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { FieldHelp } from "@/components/FieldHelp";

export interface MemoryGroup {
  min: number;
  max: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  systemRam: {
    totalGB: number;
    freeGB: number;
    recommendedMin: number;
    recommendedMax: number;
  } | null;
  detecting: boolean;
}

// Memory allocation card used on the Configure step of Quick Setup.
export function MemoryCard({ memory }: { memory: MemoryGroup }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            <CardTitle className="text-lg">Memory Allocation</CardTitle>
          </div>
          {memory.detecting ? (
            <Badge variant="outline" className="animate-pulse">
              Detecting RAM...
            </Badge>
          ) : (
            memory.systemRam && (
              <Badge variant="outline">{memory.systemRam.totalGB} GB detected</Badge>
            )
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="flex items-center gap-1.5">
                Minimum RAM
                <FieldHelp
                  description="Minimum Java heap (-Xms) reserved for the server process."
                  context="The panel pre-selects sane values based on your detected system RAM — raise it only if you know your player count needs more headroom."
                  recommendation="safe-default"
                  articleId="first-run-checklist"
                />
              </Label>
              <span className="font-mono">{memory.min}GB</span>
            </div>
            <Slider
              value={[memory.min]}
              onValueChange={([val]) => {
                memory.onMinChange(val);
                if (val > memory.max) memory.onMaxChange(val);
              }}
              min={2}
              max={16}
              step={1}
              aria-label={`Minimum RAM: ${memory.min}GB`}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="flex items-center gap-1.5">
                Maximum RAM
                <FieldHelp
                  description="Maximum Java heap (-Xmx) the server process can use."
                  context="Setting this above your available system RAM causes crashes under load; too low causes lag/OOM as the world and player count grow."
                  recommendation="safe-default"
                  articleId="first-run-checklist"
                />
              </Label>
              <span className="font-mono">{memory.max}GB</span>
            </div>
            <Slider
              value={[memory.max]}
              onValueChange={([val]) => {
                memory.onMaxChange(val);
                if (val < memory.min) memory.onMinChange(val);
              }}
              min={2}
              max={16}
              step={1}
              aria-label={`Maximum RAM: ${memory.max}GB`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
