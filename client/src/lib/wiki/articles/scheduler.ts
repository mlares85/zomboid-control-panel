import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'scheduler-overview',
    title: 'Scheduler Overview',
    category: 'scheduler',
    summary: 'How scheduled tasks work and what actions they can run.',
    tags: ['scheduler', 'automation', 'cron', 'tasks'],
    related: ['common-schedules', 'scheduled-backups'],
    content: [
      {
        type: 'paragraph',
        text: [
          'The scheduler runs actions automatically on a recurring basis, so routine maintenance doesn’t depend on someone being online to click a button. It’s the same engine behind ',
          { type: 'link', articleId: 'scheduled-backups', label: 'Scheduled Backups' },
          ', and it also handles things like scheduled restarts and broadcast announcements.',
        ],
      },
      { type: 'heading', level: 2, text: 'What a task consists of' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: 'Action' }, ' — what runs: a backup, a server restart, a broadcast message, a chunk cleanup, or an RCON command.'],
          [{ type: 'bold', text: 'Schedule' }, ' — when it runs, expressed as a recurring interval or a cron-style expression.'],
          [{ type: 'bold', text: 'Target server' }, ' — which server profile the task applies to, fixed at creation time.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'A scheduled task is bound to the server profile that was active when you created it. Switching the active server afterward doesn’t move the task — check the Scheduler page directly if you’re unsure which server a task targets.',
        ],
      },
      { type: 'heading', level: 2, text: 'Run history' },
      {
        type: 'paragraph',
        text: [
          'Each task keeps a run history showing when it last fired, whether it succeeded, and any error output. If a scheduled backup or restart silently isn’t happening, check history first — a task that’s failing every run looks identical to one that isn’t scheduled at all from the outside.',
        ],
      },
    ],
  },
  {
    id: 'common-schedules',
    title: 'Common Schedule Patterns',
    category: 'scheduler',
    summary: 'Practical scheduling recipes for backups, restarts, and announcements.',
    tags: ['scheduler', 'cron', 'examples', 'restart'],
    related: ['scheduler-overview', 'scheduled-backups'],
    content: [
      {
        type: 'paragraph',
        text: [
          'A few schedules cover most servers’ real needs. Start from one of these and adjust rather than designing a schedule from scratch.',
        ],
      },
      { type: 'heading', level: 2, text: 'Nightly restart' },
      {
        type: 'paragraph',
        text: [
          'Project Zomboid servers accumulate memory usage over long uptimes, and a scheduled restart during low-traffic hours (e.g. 4 AM local time) resets that cleanly before it becomes a problem. Pair it with a broadcast warning a few minutes before, so anyone online gets notice.',
        ],
      },
      {
        type: 'code',
        lang: 'text',
        code: 'Restart — daily at 04:00\nBroadcast warning — daily at 03:55 ("Server restarting in 5 minutes")',
      },
      { type: 'heading', level: 2, text: 'Rolling backups' },
      {
        type: 'paragraph',
        text: [
          'An hourly backup with a retention window (e.g. keep the last 24) gives fine-grained recovery without unbounded disk growth. For a slower-paced world, daily with a longer retention is usually enough — see ',
          { type: 'link', articleId: 'scheduled-backups', label: 'Scheduled Backups' },
          ' for retention settings.',
        ],
      },
      { type: 'heading', level: 2, text: 'Weekend event reminders' },
      {
        type: 'paragraph',
        text: [
          'A recurring broadcast (e.g. every Friday evening) is a low-effort way to remind an active community about scheduled events or wipes, without anyone needing to remember to post it manually.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'Stagger restarts and backups by at least a few minutes apart — running both at the exact same moment adds unnecessary load and makes it harder to tell which one caused a hiccup if players notice lag.',
        ],
      },
    ],
  },
]
