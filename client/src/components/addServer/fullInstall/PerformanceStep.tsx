import { RconCard, type RconGroup } from "./RconCard";
import { MemoryCard, type MemoryGroup } from "./MemoryCard";
import { AdvancedOptionsSection, type AdvancedGroup } from "./AdvancedOptionsSection";

interface PerformanceStepProps {
  rcon: RconGroup;
  memory: MemoryGroup;
  advanced: AdvancedGroup;
}

// Full Install Step 3: RCON, memory allocation, and advanced runtime options.
export function PerformanceStep({ rcon, memory, advanced }: PerformanceStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold">Server Settings</h2>
        <p className="text-muted-foreground">
          Configure remote control access and runtime options.
        </p>
      </div>

      <RconCard rcon={rcon} />
      <MemoryCard memory={memory} />
      <AdvancedOptionsSection advanced={advanced} />
    </div>
  );
}
