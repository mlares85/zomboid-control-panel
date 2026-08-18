import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'welcome-tour',
    title: 'Welcome to the Control Panel',
    category: 'getting-started',
    summary: 'A quick tour of what the panel does and where to find things.',
    tags: ['overview', 'tour', 'navigation', 'dashboard'],
    related: ['adding-servers', 'rcon-setup', 'first-run-checklist'],
    content: [
      {
        type: 'paragraph',
        text: [
          'The control panel is a web-based front end for running and managing a Project Zomboid dedicated server. It talks to your server two ways: through a small in-game ',
          { type: 'bold', text: 'mod bridge' },
          ' for live data (players, chat, world state) and through ',
          { type: 'bold', text: 'RCON' },
          ' for remote commands. Some features also need direct filesystem or Docker access to your server’s install folder.',
        ],
      },
      { type: 'heading', level: 2, text: 'How the sidebar is organized' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: 'Live' }, ' — the console, online players, and in-game chat. These update in real time while the server is running.'],
          [{ type: 'bold', text: 'World' }, ' — weather and event controls, and the world map.'],
          [{ type: 'bold', text: 'Config' }, ' — server settings (the INI file), mods, and simulation templates. These edit files on disk.'],
          [{ type: 'bold', text: 'Maintain' }, ' — scheduled tasks, world backups, and map chunk cleanup.'],
          [{ type: 'bold', text: 'Servers' }, ' — switch between server profiles, install a new server, or browse public servers.'],
          [{ type: 'bold', text: 'Settings & Tools' }, ' — Discord integration, panel settings, and debug logs.'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: [
          'Some nav items are grayed out or hidden for ',
          { type: 'bold', text: 'remote' },
          ' servers (RCON-only, no filesystem access). Those features need direct access to the server’s files and only work when the panel runs on the same machine as the server, or when you mirror the Server folder over SFTP.',
        ],
      },
      { type: 'heading', level: 2, text: 'The Active Server strip' },
      {
        type: 'paragraph',
        text: [
          'At the top of the sidebar you’ll see the currently active server. If you manage more than one Project Zomboid server, click it to switch — nearly every page in the panel (console, players, mods, config) always operates on whichever server is active. See ',
          { type: 'link', articleId: 'adding-servers', label: 'Adding Servers' },
          ' to register more than one.',
        ],
      },
      { type: 'heading', level: 2, text: 'Where to go next' },
      {
        type: 'list',
        items: [
          [{ type: 'link', articleId: 'first-run-checklist', label: 'First-Run Checklist' }, ' — the fastest path from a fresh install to a running server.'],
          [{ type: 'link', articleId: 'rcon-setup', label: 'RCON Setup' }, ' — required for the console, player list, and remote commands.'],
          [{ type: 'link', articleId: 'docker-overview', label: 'Docker Overview' }, ' — if you’re running (or plan to run) your server in a container.'],
        ],
      },
    ],
  },
  {
    id: 'adding-servers',
    title: 'Adding and Switching Servers',
    category: 'getting-started',
    summary: 'How server profiles work, and how to add, switch, or remove one.',
    tags: ['servers', 'profiles', 'multi-server', 'remote'],
    related: ['welcome-tour', 'rcon-setup', 'first-run-checklist'],
    content: [
      {
        type: 'paragraph',
        text: [
          'A ',
          { type: 'bold', text: 'server profile' },
          ' is the panel’s record of one Project Zomboid server: its install path, RCON credentials, and (for local servers) how it’s launched — directly or via Docker. The ',
          { type: 'link', articleId: 'adding-servers', label: 'My Servers' },
          ' page lists every profile and shows which one is active.',
        ],
      },
      { type: 'heading', level: 2, text: 'Local vs. remote servers' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: 'Local' }, ' — the panel runs on the same machine (or container host) as the server. You get full functionality: config editing, mod management, backups, chunk cleanup, live console output.'],
          [{ type: 'bold', text: 'Remote' }, ' — the panel only has RCON access to a server running elsewhere. You get commands, player actions, and chat, but not file-based features unless you configure SFTP mirroring for config access.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'Not sure which you have? If the panel and the game server are on the same box (or same Docker host with a mounted volume), you’re local. If you’re only connecting to someone else’s server over the internet, you’re remote.',
        ],
      },
      { type: 'heading', level: 2, text: 'Adding a server' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Go to ', { type: 'bold', text: 'Servers → My Servers' }, ' and click ', { type: 'bold', text: 'Add Server' }, '.'],
          ['Choose local or remote. For a local server, point the panel at the install directory (where ', { type: 'code', text: 'ProjectZomboid64.exe' }, ' or the Linux start script lives).'],
          ['Enter RCON connection details — host, port, and password. See ', { type: 'link', articleId: 'rcon-setup', label: 'RCON Setup' }, ' if you don’t have these yet.'],
          ['Save. The panel will attempt to detect status immediately; a green dot means it connected.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Switching the active server' },
      {
        type: 'paragraph',
        text: [
          'Click the Active Server strip at the top of the sidebar and pick a different profile. This changes what every page shows — there’s no per-page server selector. If you run scheduled tasks, double-check which server they’re bound to after switching, since some automation is tied to the server that was active when the task was created.',
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'Removing a server profile does not delete the underlying save data, mods, or install — it only removes the panel’s record of it. Backups and scheduled tasks tied to that profile stop running once it’s removed.',
        ],
      },
    ],
  },
  {
    id: 'rcon-setup',
    title: 'RCON Setup',
    category: 'getting-started',
    summary: 'Enable and configure RCON so the panel can send live commands.',
    tags: ['rcon', 'connection', 'password', 'port', 'console'],
    related: ['adding-servers', 'first-run-checklist'],
    content: [
      {
        type: 'paragraph',
        text: [
          'RCON (Remote Console) is Project Zomboid’s built-in protocol for sending admin commands to a running server. The panel uses it for the ',
          { type: 'link', articleId: 'welcome-tour', label: 'Console' },
          ', player actions (kick, ban, teleport), and world/weather controls. Without a working RCON connection, most of the panel’s live features stay disabled.',
        ],
      },
      { type: 'heading', level: 2, text: 'Enabling RCON on the server' },
      {
        type: 'paragraph',
        text: [
          'In your server’s ',
          { type: 'code', text: 'servertest.ini' },
          ' (or your named config file), set:',
        ],
      },
      {
        type: 'code',
        lang: 'ini',
        code: 'RCONPort=27015\nRCONPassword=your-strong-password-here',
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'If ',
          { type: 'code', text: 'RCONPassword' },
          ' is empty, RCON is effectively disabled — the server will refuse connections. This is the single most common reason the panel shows “RCON disconnected.”',
        ],
      },
      { type: 'heading', level: 2, text: 'Entering credentials in the panel' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Open the server’s profile under ', { type: 'bold', text: 'Servers → My Servers' }, ' and edit its connection details.'],
          ['Set the RCON host (usually ', { type: 'code', text: '127.0.0.1' }, ' for a local server, or the server’s public/LAN address for remote), the port (default ', { type: 'code', text: '27015' }, '), and the password — must match the INI exactly.'],
          ['Save, then check the console page. A successful connection shows a green status indicator; a red one usually means a port, firewall, or password mismatch.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Common pitfalls' },
      {
        type: 'list',
        items: [
          ['The server must be ', { type: 'bold', text: 'running' }, ' for RCON to connect — it’s not available while the server is stopped or still booting.'],
          ['If the server is behind Docker port mapping, make sure the RCON port is actually published to the host and matches what you entered here.'],
          ['Restarting the server is required after changing ', { type: 'code', text: 'RCONPort' }, ' or ', { type: 'code', text: 'RCONPassword' }, ' in the INI — it isn’t hot-reloaded.'],
          ['A firewall on the host (or a cloud security group) blocking the RCON port will look identical to a wrong password from the panel’s point of view: it just times out.'],
        ],
      },
    ],
  },
  {
    id: 'first-run-checklist',
    title: 'First-Run Checklist',
    category: 'getting-started',
    summary: 'The shortest path from a fresh install to a fully working panel.',
    tags: ['setup', 'checklist', 'getting started', 'first run'],
    related: ['adding-servers', 'rcon-setup', 'docker-overview'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Follow this in order the first time you set the panel up against a new server. Each step unlocks the next — skipping ahead usually just means backtracking later.',
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          [{ type: 'bold', text: 'Install or point at a server.' }, ' Use ', { type: 'bold', text: 'Server Setup' }, ' to install a fresh Project Zomboid dedicated server via SteamCMD, or add an existing install as a server profile. See ', { type: 'link', articleId: 'adding-servers', label: 'Adding Servers' }, '.'],
          [{ type: 'bold', text: 'Start the server once manually.' }, ' A first boot generates the default INI and sandbox config files the panel expects to find.'],
          [{ type: 'bold', text: 'Set an RCON password' }, ' in the server’s INI and enter matching credentials in the panel. See ', { type: 'link', articleId: 'rcon-setup', label: 'RCON Setup' }, '. Confirm the console shows a live connection.'],
          [{ type: 'bold', text: 'Review Server Configuration.' }, ' Check the basics — server name, password, max players, PvP — before players join.'],
          [{ type: 'bold', text: 'Set up a backup schedule.' }, ' World corruption and accidental wipes happen; a scheduled backup is cheap insurance. See ', { type: 'link', articleId: 'scheduled-backups', label: 'Scheduled Backups' }, '.'],
          [{ type: 'bold', text: 'Optional: wire up Discord.' }, ' If you want join/leave alerts or remote chat, see ', { type: 'link', articleId: 'discord-bot-setup', label: 'Discord Bot Setup' }, '.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'If something in the panel looks broken or disabled, it’s almost always one of two things: RCON isn’t connected, or the server hasn’t been started at least once yet. Check those first before digging further.',
        ],
      },
      { type: 'heading', level: 2, text: 'Running in Docker?' },
      {
        type: 'paragraph',
        text: [
          'If your server runs in a container, read ',
          { type: 'link', articleId: 'docker-overview', label: 'Docker Overview' },
          ' before Server Setup — how the panel manages the container versus a local bind-mounted install changes some of the steps above (particularly volume paths and restart behavior).',
        ],
      },
    ],
  },
]
