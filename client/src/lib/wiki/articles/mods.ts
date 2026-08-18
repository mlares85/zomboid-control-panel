import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'mod-manager-basics',
    title: 'Mod Manager Basics',
    category: 'mods',
    summary: 'How the Mod Manager finds, installs, and enables Workshop mods.',
    tags: ['mods', 'workshop', 'install', 'overview'],
    related: ['mod-conflicts', 'mod-updates'],
    content: [
      {
        type: 'paragraph',
        text: [
          'The Mod Manager wraps two things Project Zomboid keeps separate: Steam Workshop subscription (downloading mod files via SteamCMD) and the server’s ',
          { type: 'code', text: 'Mods=' },
          ' / ',
          { type: 'code', text: 'WorkshopItems=' },
          ' lines in its config, which decide what’s actually active. A mod can be downloaded but not enabled, or enabled but missing its download — the panel shows both states so you can tell which is wrong.',
        ],
      },
      { type: 'heading', level: 2, text: 'Adding a mod' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Paste a Steam Workshop URL or ID into the Mod Manager’s add field.'],
          ['The panel fetches the Workshop item’s metadata and queues a SteamCMD download.'],
          ['Once downloaded, toggle it on — this writes the mod’s ID and Workshop ID into the server config.'],
          ['Restart the server to load newly enabled mods; Project Zomboid does not hot-load mods into a running world.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'A single Workshop item can contain multiple mod IDs (common for mod packs). The panel lists each one separately once detected — make sure you enable the specific mod ID(s) you want, not just the parent Workshop item.',
        ],
      },
      { type: 'heading', level: 2, text: 'Load order' },
      {
        type: 'paragraph',
        text: [
          'Mod load order matters for mods that patch the same game systems — later entries can override earlier ones. The panel lets you drag to reorder; if two mods conflict, order often determines which one “wins.” See ',
          { type: 'link', articleId: 'mod-conflicts', label: 'Mod Conflicts' },
          ' for diagnosing that.',
        ],
      },
    ],
  },
  {
    id: 'mod-conflicts',
    title: 'Diagnosing Mod Conflicts',
    category: 'mods',
    summary: 'What a mod conflict looks like and how to track it down.',
    tags: ['mods', 'conflicts', 'crash', 'troubleshooting'],
    related: ['mod-manager-basics', 'mod-updates'],
    content: [
      {
        type: 'paragraph',
        text: [
          'A mod conflict happens when two mods edit the same underlying game file, script, or Lua hook in incompatible ways. Symptoms range from a server that won’t start, to a silent feature not working, to a crash only certain players hit.',
        ],
      },
      { type: 'heading', level: 2, text: 'Common signs' },
      {
        type: 'list',
        items: [
          ['Server fails to start right after enabling a new mod — check the console log for a Lua error naming a specific file or mod.'],
          ['World loads but a feature from one mod silently doesn’t work — likely a load-order issue where another mod overwrote the same file.'],
          ['Crashes tied to specific player actions (opening a menu, crafting) often point to a UI or recipe mod stepping on another.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Narrowing it down' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Note the exact time the problem started, and cross-reference with the mod list state saved in your most recent backups — see ', { type: 'link', articleId: 'backups-overview', label: 'Backups Overview' }, '.'],
          ['Disable recently added mods one at a time and restart, rather than all at once — this isolates which mod is responsible instead of just confirming “one of these.”'],
          ['If two mods both claim to touch the same system (e.g. two different crafting overhauls, two different UI mods), try changing their load order before disabling either — order-sensitivity is the single most common fix.'],
          ['Check the console log for the exact error text and search the mod’s Workshop page comments — most well-known conflicts are already documented there.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'Keep a small, stable “core” mod set you trust, and treat every new addition as a suspect until it’s run cleanly for a session or two. Adding several mods at once makes conflicts much harder to isolate later.',
        ],
      },
    ],
  },
  {
    id: 'mod-updates',
    title: 'Mod Updates',
    category: 'mods',
    summary: 'How the panel detects and applies Workshop mod updates.',
    tags: ['mods', 'updates', 'workshop', 'notifications'],
    related: ['mod-manager-basics', 'mod-conflicts'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Workshop mod authors push updates independently of your server. The panel periodically checks each installed mod’s Workshop metadata and flags ones with a newer version available — shown as a badge on the Mods nav item and in the Mod Manager itself.',
        ],
      },
      { type: 'heading', level: 2, text: 'Applying updates' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Open Mod Manager and review which mods have updates pending.'],
          ['Update one at a time if you can — this makes it much easier to tell which update caused a problem, if one does.'],
          ['Restart the server after updating, same as enabling a new mod — updates don’t apply to a live session.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'A mod update can change or remove save-affecting data (recipes, item IDs, vehicle definitions). Take a manual backup before updating a mod your world heavily depends on — see ',
          { type: 'link', articleId: 'scheduled-backups', label: 'Scheduled Backups' },
          '. This is especially true for major overhaul mods.',
        ],
      },
      { type: 'heading', level: 2, text: 'Pinning a version' },
      {
        type: 'paragraph',
        text: [
          'If a specific mod version works well and you don’t want auto-detected updates nagging you, you can leave it un-updated indefinitely — the panel only flags availability, it never force-updates a mod on its own. Nothing changes until you explicitly apply an update.',
        ],
      },
    ],
  },
]
