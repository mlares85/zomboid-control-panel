import {
  Archive,
  Clock,
  Download,
  Globe,
  Info,
  Link,
  Lock,
  Settings2,
  Shield,
  Zap,
} from "lucide-react";

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    icon: Settings2,
    group: "Panel",
    tip: "Panel port, restart, and appearance",
    description: "Port this admin interface listens on, plus theme.",
  },
  {
    id: "updates",
    label: "Updates",
    icon: Download,
    group: "Panel",
    tip: "Check for and apply new panel releases",
    description: "Panel release checks, downloads, and how updates apply.",
  },
  {
    id: "https",
    label: "HTTPS",
    icon: Lock,
    group: "Panel",
    tip: "TLS certificates for encrypted connections",
    description:
      "TLS termination. Enable this when exposing the panel beyond your LAN.",
  },
  {
    id: "access",
    label: "Remote access",
    icon: Globe,
    group: "Panel",
    tip: "Which browsers and devices may connect (CORS)",
    description:
      "Which origins may reach this panel from another machine, and why requests get blocked.",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    group: "Panel",
    tip: "Account password and sign-in",
    description: "Panel account password and sign-in controls.",
  },
  {
    id: "connection",
    label: "RCON",
    icon: Link,
    group: "Game server",
    tip: "Remote console connection and startup behaviour",
    description:
      "RCON connection used for commands, plus whether the game server starts with the panel.",
  },
  {
    id: "bridge",
    label: "PanelBridge",
    icon: Zap,
    group: "Game server",
    tip: "Lua mod link, including remote servers over SFTP",
    description:
      "PanelBridge Lua mod link for weather, teleport, and item control. Supports remote servers over SFTP.",
  },
  {
    id: "mods",
    label: "Mods & Workshop",
    icon: Clock,
    group: "Automation",
    tip: "Update checks, collection sync, and Steam key",
    description:
      "Workshop update detection, collection sync, and the Steam Web API key they rely on.",
  },
  {
    id: "backups",
    label: "Backups",
    icon: Archive,
    group: "Automation",
    tip: "World backup schedule and character exports",
    description: "Automatic world backups and per-character export copies.",
  },
  {
    id: "about",
    label: "About",
    icon: Info,
    group: "System",
    tip: "Version, runtime info, and settings kept on other pages",
    description:
      "Panel version and runtime details, plus where the remaining settings live.",
  },
];

export const SETTINGS_GROUPS = SETTINGS_SECTIONS.reduce<
  { name: string; sections: typeof SETTINGS_SECTIONS }[]
>((groups, section) => {
  const existing = groups.find((group) => group.name === section.group);
  if (existing) existing.sections.push(section);
  else groups.push({ name: section.group, sections: [section] });
  return groups;
}, []);

// Keeps older ?tab= links and in-app deep links working after the rename.
const LEGACY_TAB_ALIASES: Record<string, string> = {
  panel: "general",
  rcon: "connection",
  "api-keys": "mods",
};
const VALID_TABS = SETTINGS_SECTIONS.map((s) => s.id);

export function resolveSettingsTabId(tab: string | null): string | null {
  if (!tab) return null;
  const resolved = LEGACY_TAB_ALIASES[tab] ?? tab;
  return VALID_TABS.includes(resolved) ? resolved : null;
}
