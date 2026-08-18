import type { FieldHelpData } from '../types'

const DEEP_DIVE = 'server-config-deep-dive'
const RCON = 'rcon-setup'

// Field-level help for INI settings on the Server Configuration page.
// Keyed by INI `key`. Not every setting needs an entry — IniSettingRow
// simply omits the help icon when no entry exists.
export const INI_HELP: Record<string, FieldHelpData> = {
  PublicName: {
    description: 'The server name shown in the in-game server browser.',
    context: 'Purely cosmetic, but it is the first thing players see when picking your server from a list — make it identifiable.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  PublicDescription: {
    description: 'Longer description shown in the server browser detail pane.',
    context: 'Good place for rules, Discord invite, or mod list summary. Supports plain text only.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  Public: {
    description: 'Whether the server is listed in the public Steam server browser.',
    context: 'Turn off for private/whitelisted servers — players can still connect directly by IP even when unlisted.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  Open: {
    description: 'Allows any Steam account to join without being added to the whitelist first.',
    context: 'Disable this to require admin-approved whitelisting for every new player.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  Password: {
    description: 'Password required to join the server.',
    context: 'Stored in plain text in the INI file on disk. Leave blank for no password, or pair with Public=false for an invite-only server.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  MaxPlayers: {
    description: 'Maximum number of players who can be connected simultaneously.',
    context: 'Higher counts increase CPU and memory load on the host. Test performance headroom before raising this on a live server.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  PauseEmpty: {
    description: 'Pauses the in-game clock when no players are connected.',
    context: 'Prevents zombies, weather, and world state from advancing while the server sits idle overnight.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  ServerWelcomeMessage: {
    description: 'Message shown to players when they connect.',
    context: 'Supports PZ rich-text tags (<LINE>, <RGB>, etc.) for formatting. Good place for rules or a Discord link.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  Map: {
    description: 'Which map(s) the server loads, semicolon-separated for multi-map setups.',
    context: 'Changing this on an existing save can orphan player spawns. Back up your save before switching maps on a live server.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  SaveWorldEveryMinutes: {
    description: 'How often the world autosaves, in minutes.',
    context: 'Shorter intervals reduce data loss on a crash but add periodic disk I/O load.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  AnnounceDeath: {
    description: 'Broadcasts a global chat message whenever a player dies.',
    context: 'Purely a flavor/community setting — has no effect on gameplay balance.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  DefaultPort: {
    description: 'The main game (UDP) port players connect through.',
    context: 'Must be forwarded on your router/firewall if hosting outside a container network. Changing it requires updating any port-forward rules and reconnect instructions you give players.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  UPnP: {
    description: 'Automatically opens the required ports on routers that support UPnP.',
    context: 'Convenient for home hosting; has no effect on VPS/cloud hosts, where you must forward ports manually.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  PingFrequency: {
    description: 'How often (seconds) the server pings connected clients to measure latency.',
    context: 'Rarely needs changing — lower values add a small amount of network chatter.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  PingLimit: {
    description: 'Maximum ping (ms) a client can have before being disconnected.',
    context: 'Set to 0 to disable ping-based kicks entirely. Useful if legitimate players on high-latency connections get dropped.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  DenyLoginOnOverloadedServer: {
    description: 'Rejects new connections when the server is under heavy load.',
    context: 'Protects existing players\' experience during load spikes at the cost of turning away new joiners.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  SpeedLimit: {
    description: 'Maximum allowed player movement speed multiplier before anti-cheat flags it.',
    context: 'Raising this can mask real speedhacking; lower it if legitimate high-speed actions (vehicles) are falsely flagged.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  MaxPacketsPerSecond: {
    description: 'Caps how many network packets per second the server will process per client.',
    context: 'A defense against packet-flood abuse. Lowering it too far can cause lag for legitimate players with lots of activity.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  PVP: {
    description: 'Enables player-vs-player combat damage.',
    context: 'Also controls whether the in-game Safety system (safe zones) is relevant — see SafetySystem below.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  SafetySystem: {
    description: 'Lets players toggle a personal PvP-safe state with a cooldown timer.',
    context: 'Only meaningful when PVP is enabled — gives players a way to opt out of combat temporarily.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  GlobalChat: {
    description: 'Enables the server-wide (unfiltered by distance) chat channel.',
    context: 'Disabling forces players to use local/radio chat only, which suits more immersive/RP servers.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  MaxAccountsPerUser: {
    description: 'How many in-game characters a single Steam account can create.',
    context: 'Set to 1 to prevent players from spinning up throwaway characters to dodge death penalties or bans on a character.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  DropOffWhiteListAfterDeath: {
    description: 'Removes a player from the whitelist automatically when their character dies.',
    context: 'Turns permadeath into a one-life-per-invite system — combine carefully with Open=false.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  SleepAllowed: {
    description: 'Lets players sleep to pass time.',
    context: 'Sleeping can desync a shared day/night cycle across players; many multiplayer servers disable it.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  PlayerSafehouse: {
    description: 'Allows players to claim buildings as protected safehouses.',
    context: 'Core to base-security balance — disabling it means no building is ever protected from other players.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  HoursForLootRespawn: {
    description: 'In-game hours before looted containers can respawn items.',
    context: '0 disables loot respawning entirely, keeping the world\'s scarcity permanent.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  Mods: {
    description: 'Semicolon-separated list of installed mod IDs, loaded in this order.',
    context: 'Mod load order matters for compatibility. Mod IDs here must match the WorkshopItems below and be present on the server\'s Workshop folder.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  WorkshopItems: {
    description: 'Semicolon-separated Steam Workshop item IDs the server downloads and keeps updated.',
    context: 'Must stay in sync with the Mods list — a Workshop ID here without a matching mod ID in Mods won\'t load.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  DoLuaChecksum: {
    description: 'Verifies that a connecting client\'s Lua files match the server\'s.',
    context: 'Must be disabled when using PanelBridge — the bridge mod modifies server-side Lua files, which causes checksum mismatches and blocks every player from connecting.',
    recommendation: 'must-configure',
    articleId: DEEP_DIVE,
  },
  SteamPort1: {
    description: 'First Steam networking port used for the server browser and Steam auth.',
    context: 'Must be forwarded alongside DefaultPort and SteamPort2 for the server to appear in the Steam browser.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  SteamPort2: {
    description: 'Second Steam networking port, used together with SteamPort1.',
    context: 'Both Steam ports must be open and distinct from DefaultPort/RCONPort or Steam services will fail intermittently.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  SteamScoreboard: {
    description: 'Shows real Steam names and avatars on the in-game scoreboard.',
    context: 'Disabling improves player privacy at the cost of not being able to identify griefers by Steam profile.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  SteamVAC: {
    description: 'Enables Valve Anti-Cheat for connecting clients.',
    context: 'Disabling VAC is sometimes required for modded servers with client-side tweaks, but it removes Steam-level cheat protection.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  VoiceEnable: {
    description: 'Enables built-in proximity voice chat.',
    context: 'Adds continuous voice-data network traffic per connected client — most communities use Discord instead and leave this off.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  DiscordEnable: {
    description: 'Enables the server\'s built-in Discord chat bridge (separate from PanelBridge\'s Discord integration).',
    context: 'Requires DiscordToken and DiscordChannel/DiscordChannelID to be configured below. Leave off if you use the panel\'s own Discord integration instead.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  RCONPort: {
    description: 'TCP port the RCON protocol listens on for remote admin commands.',
    context: 'The panel connects to this port to run live commands. Must be forwarded/reachable and distinct from the game ports.',
    recommendation: 'advanced',
    articleId: RCON,
  },
  RCONPassword: {
    description: 'Password required to authenticate an RCON connection.',
    context: 'This is the credential the panel itself uses to control the server — treat it like any other admin secret and change it from the default.',
    recommendation: 'must-configure',
    articleId: RCON,
  },
  BackupsCount: {
    description: 'How many rotating automatic backups to retain before the oldest is deleted.',
    context: 'Higher counts use more disk space proportional to your save size — balance against available storage.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  BackupsOnStart: {
    description: 'Creates a backup automatically every time the server starts.',
    context: 'Cheap insurance against a bad startup or crash-corrupted save from the previous session.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  BackupsOnVersionChange: {
    description: 'Creates a backup automatically when the game version changes.',
    context: 'Protects your save if a game update turns out to be incompatible and you need to roll back.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  BackupsPeriod: {
    description: 'Minutes between automatic backups. 0 disables periodic backups.',
    context: 'Frequent backups protect against data loss but add periodic disk I/O — the panel\'s own backup scheduler can supplement or replace this.',
    recommendation: 'safe-default',
    articleId: DEEP_DIVE,
  },
  BadWordPolicy: {
    description: 'Action taken automatically when a banned word is detected in chat.',
    context: 'Requires a BadWordListFile to be set — this setting does nothing without a word list configured.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
  Seed: {
    description: 'World generation seed, fixed at first launch.',
    context: 'Only takes effect on a brand-new map/save — changing it later has no effect on an already-generated world.',
    recommendation: 'advanced',
    articleId: DEEP_DIVE,
  },
}
