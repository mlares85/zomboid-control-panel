import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'backups-overview',
    title: 'World Backups Overview',
    category: 'backups',
    summary: 'What gets backed up, where backups live, and why they matter.',
    tags: ['backups', 'save', 'world', 'overview'],
    related: ['scheduled-backups', 'restoring-a-backup'],
    content: [
      {
        type: 'paragraph',
        text: [
          'A backup is a point-in-time snapshot of your server’s save data — the world map, player data, and server config for a given save slot. Project Zomboid worlds are cumulative and hard to hand-fix, so backups are the main safety net against corruption, a bad mod update, or an admin mistake.',
        ],
      },
      { type: 'heading', level: 2, text: 'What gets included' },
      {
        type: 'list',
        items: [
          ['The active save folder for the running sandbox (map chunks, zombie population state, vehicles, player inventories).'],
          ['Server configuration files (INI and sandbox settings) as they were at backup time, so a restore also puts settings back the way they were.'],
          ['Mod list state at time of backup — useful for diagnosing whether a problem started after a mod change.'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: [
          'Backups do not include the Project Zomboid server binaries or Steam Workshop mod files themselves — only your world data and config. Reinstalling the server or mods is a separate step from restoring a backup.',
        ],
      },
      { type: 'heading', level: 2, text: 'Where backups are stored' },
      {
        type: 'paragraph',
        text: [
          'By default, backups are written to a backups directory alongside the panel’s data, tagged with a timestamp and a reason (manual, scheduled, or shutdown). The panel automatically takes a shutdown backup whenever the server stops cleanly, in addition to anything you schedule — see ',
          { type: 'link', articleId: 'scheduled-backups', label: 'Scheduled Backups' },
          '.',
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'Backups consume disk space proportional to world size, which grows over time as more of the map gets explored. Old backups aren’t deleted automatically unless retention is configured — check available disk space periodically on long-running servers.',
        ],
      },
    ],
  },
  {
    id: 'scheduled-backups',
    title: 'Scheduled Backups',
    category: 'backups',
    summary: 'Automate regular backups so you never have to remember.',
    tags: ['backups', 'schedule', 'automation', 'retention'],
    related: ['backups-overview', 'scheduler-overview'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Scheduled backups run automatically on an interval you choose, without needing anyone to remember to click a button. They’re configured from the Backups page and use the same underlying scheduler as other automated tasks — see ',
          { type: 'link', articleId: 'scheduler-overview', label: 'Scheduler Overview' },
          ' for how schedules are defined.',
        ],
      },
      { type: 'heading', level: 2, text: 'Setting one up' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Go to ', { type: 'bold', text: 'Backups' }, ' and open the schedule settings.'],
          ['Pick a frequency — hourly for an active PvP server, daily for a casual co-op world is usually enough.'],
          ['Set a retention count or age so old backups get pruned automatically instead of filling the disk.'],
          ['Save. The next run time is shown on the page; you can also trigger a manual backup at any time without disturbing the schedule.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'A backup taken while the server is running is still consistent — the panel coordinates with the game process so it doesn’t capture a half-written save. You don’t need to stop the server first.',
        ],
      },
      { type: 'heading', level: 2, text: 'Choosing a frequency' },
      {
        type: 'list',
        items: [
          ['More frequent backups mean less lost progress if something goes wrong, at the cost of more disk usage and periodic I/O load during the backup itself.'],
          ['If your world is large, a backup can take noticeably long — avoid scheduling one during peak play hours if you notice lag correlating with backup runs.'],
        ],
      },
    ],
  },
  {
    id: 'restoring-a-backup',
    title: 'Restoring a Backup',
    category: 'backups',
    summary: 'Step-by-step recovery when you need to roll back the world.',
    tags: ['backups', 'restore', 'recovery', 'rollback'],
    related: ['backups-overview', 'scheduled-backups'],
    content: [
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'Restoring a backup overwrites the ', { type: 'bold', text: 'current' }, ' world with the snapshot you choose. Anything that happened after that snapshot is lost. If you’re unsure, take a fresh manual backup of the current state first — restoring never deletes other backups, so this costs nothing but a moment.',
        ],
      },
      { type: 'heading', level: 2, text: 'Steps' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Stop the server. Restoring into a running server risks the game process overwriting files mid-restore.'],
          ['Open ', { type: 'bold', text: 'Backups' }, ' and find the snapshot you want — each entry shows its timestamp and whether it was manual, scheduled, or a shutdown backup.'],
          ['Click restore and confirm. The panel replaces the active save and config with the snapshot’s contents.'],
          ['Start the server again and verify in the console that it comes up clean before letting players back in.'],
        ],
      },
      { type: 'heading', level: 2, text: 'If a restore fails' },
      {
        type: 'list',
        items: [
          ['Check disk space first — a failed restore due to insufficient space can leave the save folder in a partial state.'],
          ['Confirm the backup file isn’t itself corrupted (rare, but possible if the disk filled up mid-backup) by trying an older snapshot.'],
          ['If the server won’t start after a restore, check the server config version in the restored snapshot matches the currently installed server build — restoring a very old backup onto a newer server binary can occasionally need a config migration.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'Communicate downtime to players before restoring — a restore is a hard rollback, not a merge, so anyone who played after the snapshot will lose that progress.',
        ],
      },
    ],
  },
]
