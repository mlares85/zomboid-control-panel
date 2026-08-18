import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'templates-overview',
    title: 'Simulation Templates Overview',
    category: 'templates',
    summary: 'What templates are and why they beat editing sandbox settings by hand.',
    tags: ['templates', 'sandbox', 'overview'],
    related: ['creating-templates', 'template-diff-preview'],
    content: [
      {
        type: 'paragraph',
        text: [
          'A template is a saved, reusable set of sandbox options — zombie population, loot rarity, XP multipliers, and every other knob in Project Zomboid’s sandbox settings. Instead of manually re-editing dozens of values every time you want to switch between, say, a survival-focused ruleset and a builder-friendly one, you save each as a template and apply it in one action.',
        ],
      },
      { type: 'heading', level: 2, text: 'Why use templates instead of raw sandbox editing' },
      {
        type: 'list',
        items: [
          ['Applying a template is atomic — either the whole ruleset is applied or none of it is, so you never end up with half-changed settings.'],
          ['Templates show a diff before applying (see ', { type: 'link', articleId: 'template-diff-preview', label: 'Template Diff Preview' }, '), so you know exactly what will change.'],
          ['You can keep a library of known-good rulesets and switch between them for different play styles or events, without losing track of what each one contains.'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: [
          'Templates only affect sandbox/gameplay settings — they don’t touch server-level config like RCON port, server name, or mod list. Those are edited separately under Server Configuration.',
        ],
      },
      { type: 'heading', level: 2, text: 'Applying a template' },
      {
        type: 'paragraph',
        text: [
          'Applying a template requires a server restart to take full effect for most values, since sandbox settings are read at world load. The panel will tell you if a restart is needed after applying.',
        ],
      },
    ],
  },
  {
    id: 'creating-templates',
    title: 'Creating a Template',
    category: 'templates',
    summary: 'Build a new template from scratch or from the current server settings.',
    tags: ['templates', 'create', 'sandbox'],
    related: ['templates-overview', 'template-diff-preview'],
    content: [
      {
        type: 'heading', level: 2, text: 'Two ways to start' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: 'From current settings' }, ' — snapshots whatever your server is running right now into a new named template. Good for capturing a ruleset you’ve tuned by hand and want to reuse or share.'],
          [{ type: 'bold', text: 'From scratch' }, ' — starts from Project Zomboid’s defaults, letting you build a ruleset intentionally rather than starting from whatever’s currently live.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Steps' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Go to ', { type: 'bold', text: 'Templates' }, ' and choose ', { type: 'bold', text: 'New Template' }, '.'],
          ['Pick a starting point (current settings or defaults) and give it a descriptive name — “Hard Survival, No Loot Respawn” is more useful later than “Template 3.”'],
          ['Adjust the values you care about. Fields you don’t touch keep the starting point’s value.'],
          ['Save. The template is now available to apply to this or any other server profile.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'Templates are portable across server profiles — build one on a test server and apply it to your main one once you’re happy with it.',
        ],
      },
    ],
  },
  {
    id: 'template-diff-preview',
    title: 'Reading the Template Diff Preview',
    category: 'templates',
    summary: 'Understand exactly what a template will change before applying it.',
    tags: ['templates', 'diff', 'preview', 'apply'],
    related: ['templates-overview', 'creating-templates'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Before a template is applied, the panel shows a diff: every setting whose value would change, its current value, and the template’s value. Settings the template doesn’t touch aren’t shown — the diff is scoped to actual changes, not the entire sandbox config.',
        ],
      },
      { type: 'heading', level: 2, text: 'What to check before confirming' },
      {
        type: 'list',
        items: [
          ['Any value going from “on” to “off” for something players are actively relying on (e.g. disabling zombie respawn mid-playthrough) — this is reversible in settings, but not in world state that already happened under the old rule.'],
          ['Multiplier changes (XP, loot, zombie count) — these usually don’t retroactively affect what’s already in the world, only what happens going forward.'],
          ['Whether the diff is larger than you expected — a big unexpected diff usually means you picked the wrong template, or the current server settings had drifted further from that template’s baseline than you remembered.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'The diff preview compares against the server’s ', { type: 'bold', text: 'current' }, ' live settings, not against any previous template you applied. If you’ve made manual tweaks since the last template apply, those tweaks show up in the diff as changes even if they weren’t part of what you’re trying to review.',
        ],
      },
    ],
  },
]
