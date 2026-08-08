import { Info, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Static explainer for what PanelBridge is and how to set it up. No props —
// entirely self-contained copy.
export function BridgeHowItWorksDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
          <Info className="w-3.5 h-3.5" />
          How it works
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Panel Bridge
          </DialogTitle>
          <DialogDescription>
            A Lua mod that runs inside Project Zomboid, giving this panel
            direct access to the live game world.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          {/* What it unlocks */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              What it unlocks
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="font-medium text-foreground">
                  Weather & Climate
                </p>
                <p className="text-xs text-muted-foreground">
                  Storms, rain, temperature, fog, wind
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="font-medium text-foreground">Player Actions</p>
                <p className="text-xs text-muted-foreground">
                  Teleport, heal, god mode, inventory
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="font-medium text-foreground">World Control</p>
                <p className="text-xs text-muted-foreground">
                  Utilities, zombies, time, sandbox
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="font-medium text-foreground">Chat & Sound</p>
                <p className="text-xs text-muted-foreground">
                  Server chat, admin chat, world sounds
                </p>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              How it works
            </p>
            <p className="text-muted-foreground mb-3">
              Two pieces meet in the middle: the panel runs a file watcher,
              and{" "}
              <strong className="text-foreground">PanelBridge.lua</strong>{" "}
              runs inside the game. They exchange commands via JSON files.
            </p>
          </div>

          {/* Setup steps */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Setup
            </p>
            <ol className="space-y-2">
              <li className="flex gap-3 items-start">
                <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-medium">Install the Lua file</p>
                  <p className="text-muted-foreground text-xs">
                    Use the Install section on this tab to copy
                    PanelBridge.lua into your server.
                  </p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  2
                </span>
                <div>
                  <p className="font-medium">Run Auto Setup</p>
                  <p className="text-muted-foreground text-xs">
                    Points the panel at the correct server data folder and
                    starts the watcher.
                  </p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="flex-none w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  3
                </span>
                <div>
                  <p className="font-medium">Start the PZ server</p>
                  <p className="text-muted-foreground text-xs">
                    When the game loads the mod, status changes from{" "}
                    <strong className="text-warning">Waiting</strong> to{" "}
                    <strong className="text-primary">Connected</strong>.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          {/* Requirement */}
          <div className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs">
            <p>
              <strong>Requires LuaChecksum=false</strong> in your server INI.
              Commands can fail with checksum enabled.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
