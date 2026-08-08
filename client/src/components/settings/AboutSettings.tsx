import { Link as RouterLink } from "react-router-dom";
import {
  Coffee,
  ExternalLink,
  Heart,
  MessageCircle,
  Server,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PanelUpdateStatus } from "@/lib/api";

const ELSEWHERE_LINKS = [
  {
    href: "/servers",
    label: "Server profiles",
    detail: "Install paths, RCON host and password, memory, and SteamCMD.",
  },
  {
    href: "/discord",
    label: "Discord bot",
    detail: "Bot token, channels, event notifications, and the chat bridge.",
  },
  {
    href: "/scheduler",
    label: "Scheduled tasks",
    detail: "Restarts, announcements, and recurring commands.",
  },
  {
    href: "/server-config",
    label: "Game server config",
    detail: "Server INI options and sandbox rules.",
  },
  {
    href: "/chat",
    label: "Chat quick messages",
    detail: "Preset messages shown above the chat input.",
  },
];

interface AboutSettingsProps {
  panelUpdateStatus: PanelUpdateStatus | null;
}

export function AboutSettings({ panelUpdateStatus }: AboutSettingsProps) {
  return (
    <>
      <Card id="settings-elsewhere">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-primary" />
            Settings kept on other pages
          </CardTitle>
          <CardDescription>
            These features own their own configuration, so it lives with the
            feature instead of here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/50">
            {ELSEWHERE_LINKS.map((item) => (
              <li key={item.href}>
                <RouterLink
                  to={item.href}
                  className="flex items-center justify-between gap-4 py-2.5 group"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground group-hover:text-primary">
                      {item.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                  <ExternalLink
                    className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </RouterLink>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card id="settings-about">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            About
          </CardTitle>
          <CardDescription>
            Panel version, runtime info, and helpful links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Installed version
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  v{panelUpdateStatus?.currentVersion || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Latest available
                </p>
                <p className="text-lg font-semibold tabular-nums flex items-center gap-2">
                  {panelUpdateStatus?.latestVersion ? (
                    <>
                      v{panelUpdateStatus.latestVersion}
                      {panelUpdateStatus.updateAvailable && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          Update available
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground text-base font-normal">
                      Not checked yet
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            A web-based management panel for Project Zomboid dedicated
            servers. Includes RCON, player management, mod update detection,
            scheduled restarts, world backups, Discord integration, and the
            PanelBridge Lua mod for in-world actions.
          </p>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Heart className="w-4 h-4 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Enjoying the panel?</p>
                <p className="text-xs text-muted-foreground">
                  Support development to keep updates and new features
                  coming.
                </p>
              </div>
            </div>
            <a
              href="https://ko-fi.com/fpsacha"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF5E5B] px-4 py-2 text-sm font-medium text-white hover:bg-[#FF4541] transition-colors shrink-0 shadow-sm"
              aria-label="Buy me a coffee on Ko-fi"
            >
              <Coffee className="w-3.5 h-3.5" aria-hidden="true" />
              Buy me a coffee
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <a
              href="https://discord.gg/jHsWJDNmSg"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/10 px-3 py-2 text-sm text-[#5865F2] hover:bg-[#5865F2]/20 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Join Discord
            </a>
            <a
              href="https://github.com/fpsacha/zomboid-control-panel"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              GitHub repository
            </a>
            <a
              href="https://github.com/fpsacha/zomboid-control-panel/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              Releases &amp; changelog
            </a>
            <a
              href="https://github.com/fpsacha/zomboid-control-panel/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              Report an issue
            </a>
          </div>

          <div className="pt-4 border-t border-border/40 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Built with React, Node.js, and Socket.IO</span>
            <span aria-hidden="true">·</span>
            <span>MIT licensed</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
