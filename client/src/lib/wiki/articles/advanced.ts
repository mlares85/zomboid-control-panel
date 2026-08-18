import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'steamcmd-deep-dive',
    title: 'SteamCMD Deep Dive',
    category: 'advanced',
    summary: 'How the panel uses SteamCMD for installs, updates, and Workshop mods.',
    tags: ['steamcmd', 'steam', 'updates', 'advanced'],
    related: ['docker-overview', 'mod-updates'],
    content: [
      {
        type: 'paragraph',
        text: [
          'SteamCMD is Valve’s command-line tool for downloading dedicated server files and Workshop content without a full Steam client. The panel shells out to it for server installs, updates, and mod downloads — understanding what it’s doing helps when something fails.',
        ],
      },
      { type: 'heading', level: 2, text: 'What a typical run looks like' },
      {
        type: 'code',
        lang: 'text',
        code: 'login anonymous\napp_update 380870 validate\nquit',
      },
      {
        type: 'paragraph',
        text: [
          'App ID ',
          { type: 'code', text: '380870' },
          ' is the Project Zomboid dedicated server. The ',
          { type: 'code', text: 'validate' },
          ' flag checks every file’s hash against Steam’s manifest and re-downloads anything mismatched — slower, but it catches partial or corrupted downloads that a plain update would leave broken.',
        ],
      },
      { type: 'heading', level: 2, text: 'Workshop downloads' },
      {
        type: 'paragraph',
        text: [
          'Mods are fetched with ',
          { type: 'code', text: 'workshop_download_item' },
          ', landing in a per-item folder under SteamCMD’s workshop content directory. The panel copies or symlinks these into the server’s active mod path — if a mod shows as downloaded but the server can’t find it, this copy step is the first thing to check.',
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'SteamCMD anonymous login is rate-limited and occasionally rejected by Steam under load, especially for large batch mod downloads. A failed download that succeeds on retry is normal, not necessarily a config problem.',
        ],
      },
      { type: 'heading', level: 2, text: 'Disk usage' },
      {
        type: 'paragraph',
        text: [
          'SteamCMD keeps its own download cache separate from the installed server files, roughly doubling disk usage during an update until the cache is cleared. On disk-constrained hosts, this is a common cause of updates failing partway through with no obviously related error.',
        ],
      },
    ],
  },
  {
    id: 'server-config-deep-dive',
    title: 'Server Config Deep Dive',
    category: 'advanced',
    summary: 'How the panel maps the INI file to the Server Configuration UI.',
    tags: ['config', 'ini', 'sandbox', 'advanced'],
    related: ['templates-overview', 'performance-tuning'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Project Zomboid splits configuration across two files: the main server INI (network, RCON, player limits, moderation) and the sandbox options (gameplay rules — zombie settings, loot, XP). The panel’s Server Configuration page presents both through one UI, but they’re validated and saved independently under the hood.',
        ],
      },
      { type: 'heading', level: 2, text: 'Validation' },
      {
        type: 'paragraph',
        text: [
          'The panel validates types and ranges client-side before saving — a port field rejects non-numeric input, an enum field only accepts known values. This catches typos before they hit disk, but it can’t catch every combination that’s technically valid but produces a nonsensical server (e.g. max players set to 0).',
        ],
      },
      { type: 'heading', level: 2, text: 'What requires a restart' },
      {
        type: 'list',
        items: [
          ['Network settings (ports, RCON) — always require a restart; the server binds these once at boot.'],
          ['Most sandbox gameplay settings — read once at world load, so they need a restart to take effect, though a few (like some broadcast-related settings) apply live.'],
          ['Mod list changes — always require a restart, since mods are loaded during boot.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'When in doubt about whether a change took effect, restart — the vast majority of config values are boot-time only, and a restart is cheap compared to debugging a setting that silently isn’t applied.',
        ],
      },
    ],
  },
  {
    id: 'performance-tuning',
    title: 'Performance Tuning',
    category: 'advanced',
    summary: 'JVM memory, zombie population, and other levers that affect server load.',
    tags: ['performance', 'memory', 'tps', 'advanced'],
    related: ['server-config-deep-dive'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Project Zomboid’s dedicated server runs on the JVM, and most performance issues trace back to one of three things: allocated memory, zombie population/simulation load, or disk I/O during saves. Tuning usually means adjusting one of these, not all three at once.',
        ],
      },
      { type: 'heading', level: 2, text: 'Memory' },
      {
        type: 'paragraph',
        text: [
          'The server’s JVM heap size is set via a startup flag (commonly ',
          { type: 'code', text: '-Xmx' },
          '). Too little memory causes garbage-collection pauses that show up as periodic freezes; too much reserved on a shared host can starve other processes. A rough starting point is 4–6 GB for a small server, scaling up with player count and explored map area.',
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'Setting heap size larger than the host’s available physical memory doesn’t help — it forces swapping, which is far slower than a smaller heap with more frequent (but fast) garbage collection.',
        ],
      },
      { type: 'heading', level: 2, text: 'Zombie population' },
      {
        type: 'paragraph',
        text: [
          'Zombie count and respawn settings directly drive CPU load — more zombies means more pathfinding and simulation each tick. If TPS (ticks per second, shown in the console) drops under load, population settings are the first sandbox values worth reducing, ahead of memory changes.',
        ],
      },
      { type: 'heading', level: 2, text: 'Save/backup I/O' },
      {
        type: 'paragraph',
        text: [
          'Periodic autosaves and scheduled backups both involve significant disk writes. On slower storage (spinning disks, network-mounted volumes), these can cause brief server hitches — see ',
          { type: 'link', articleId: 'orbstack-macos', label: 'OrbStack on macOS' },
          ' for one common case of slow bind-mount I/O, and consider spacing autosave and backup timing apart.',
        ],
      },
    ],
  },
  {
    id: 'panelbridge-internals',
    title: 'PanelBridge Internals',
    category: 'advanced',
    summary: 'How the in-game mod bridge relays live data back to the panel.',
    tags: ['bridge', 'mod', 'websocket', 'advanced', 'internals'],
    related: ['rcon-setup', 'discord-channel-wiring'],
    content: [
      {
        type: 'paragraph',
        text: [
          'RCON is one-directional and command-oriented — good for sending actions, poor for streaming live state. The panel’s bridge mod runs inside the game server itself and pushes events (chat messages, player join/leave, world state) out to the panel over a local connection, which is how features like live chat and the player list stay real-time instead of polling.',
        ],
      },
      { type: 'heading', level: 2, text: 'Why both RCON and the bridge exist' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: 'RCON' }, ' — panel → server, for commands (kick, teleport, broadcast, sandbox changes).'],
          [{ type: 'bold', text: 'Bridge' }, ' — server → panel, for events (chat, join/leave, periodic world snapshots).'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: [
          'You can run the panel with only RCON connected — you lose live chat and instant player updates, but commands, console, and config editing still work. The bridge is an enhancement layer, not a hard requirement.',
        ],
      },
      { type: 'heading', level: 2, text: 'Troubleshooting a disconnected bridge' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Confirm the bridge mod is enabled in the server’s mod list — it’s a mod like any other and needs to be active to load.'],
          ['Check the server console log at boot for a bridge initialization line; a missing or errored line means the mod didn’t start, usually due to a load-order or version mismatch.'],
          ['Verify the local port the bridge uses isn’t blocked by a firewall rule that was added after initial setup.'],
        ],
      },
    ],
  },
]
