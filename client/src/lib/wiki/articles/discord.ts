import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'discord-bot-setup',
    title: 'Discord Bot Setup',
    category: 'discord',
    summary: 'Create a bot application and connect it to the panel.',
    tags: ['discord', 'bot', 'token', 'setup'],
    related: ['discord-channel-wiring', 'discord-commands'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Discord integration lets the panel post server events (join/leave, chat, restarts) into a channel, and optionally accept commands from Discord. It requires a bot application registered on Discord’s developer portal, with its token entered into the panel.',
        ],
      },
      { type: 'heading', level: 2, text: 'Creating the bot' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Go to the ', { type: 'extlink', href: 'https://discord.com/developers/applications', label: 'Discord Developer Portal' }, ' and create a new application.'],
          ['Under ', { type: 'bold', text: 'Bot' }, ', add a bot user and copy its token — treat this like a password; anyone with it can control the bot.'],
          ['Enable the ', { type: 'bold', text: 'Message Content Intent' }, ' if you want two-way chat bridging (reading messages, not just posting them).'],
          ['Generate an invite link with the ', { type: 'code', text: 'bot' }, ' scope and at minimum ', { type: 'code', text: 'Send Messages' }, ' and ', { type: 'code', text: 'Read Message History' }, ' permissions, then invite it to your server.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Entering the token in the panel' },
      {
        type: 'paragraph',
        text: [
          'Paste the bot token into ', { type: 'bold', text: 'Discord Integration' }, ' in the panel and save. A successful connection shows the bot as online in your Discord server within a few seconds.',
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'If you ever paste a bot token somewhere public (a screenshot, a commit, a chat log), regenerate it immediately from the developer portal — a leaked token gives full control of the bot, including reading any channel it can see.',
        ],
      },
    ],
  },
  {
    id: 'discord-channel-wiring',
    title: 'Wiring Up Channels',
    category: 'discord',
    summary: 'Route server events and chat to the right Discord channels.',
    tags: ['discord', 'channels', 'chat bridge', 'notifications'],
    related: ['discord-bot-setup', 'discord-commands'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Once the bot is connected, each type of event — chat, join/leave, admin alerts, backup results — can be routed to its own channel, or all combined into one. Splitting them keeps a busy chat channel from drowning out important alerts.',
        ],
      },
      { type: 'heading', level: 2, text: 'Typical setup' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: '#zomboid-chat' }, ' — two-way in-game chat bridge, so Discord and in-game players can talk to each other.'],
          [{ type: 'bold', text: '#zomboid-alerts' }, ' — join/leave notifications, server start/stop, and update availability.'],
          [{ type: 'bold', text: '#zomboid-admin' }, ' — backup results, scheduled task failures, and anything that needs an admin’s attention.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'The bot needs ', { type: 'code', text: 'Send Messages' }, ' permission in every channel you wire up — a channel-specific permission override on Discord’s side is a common reason messages silently don’t appear even though the bot shows online.',
        ],
      },
      { type: 'heading', level: 2, text: 'Two-way chat' },
      {
        type: 'paragraph',
        text: [
          'For chat to flow from Discord back into the game, the Message Content Intent from ',
          { type: 'link', articleId: 'discord-bot-setup', label: 'Discord Bot Setup' },
          ' must be enabled, and the panel’s in-game bridge mod must be running — Discord-only setups without the bridge can post alerts but can’t relay chat either direction.',
        ],
      },
    ],
  },
  {
    id: 'discord-commands',
    title: 'Discord Commands',
    category: 'discord',
    summary: 'Run server actions from Discord using slash commands.',
    tags: ['discord', 'commands', 'slash commands', 'admin'],
    related: ['discord-bot-setup', 'discord-channel-wiring'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Once connected, the bot registers a set of slash commands in your Discord server so admins can check status or run common actions without opening the panel — useful for quick checks from a phone.',
        ],
      },
      { type: 'heading', level: 2, text: 'Available commands' },
      {
        type: 'list',
        items: [
          [{ type: 'code', text: '/status' }, ' — shows whether the server is running and how many players are online.'],
          [{ type: 'code', text: '/players' }, ' — lists currently connected players.'],
          [{ type: 'code', text: '/restart' }, ' — triggers a server restart (restricted to configured admin roles).'],
          [{ type: 'code', text: '/announce' }, ' — broadcasts a message in-game from Discord.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'Restrict destructive commands (restart, shutdown) to a specific admin role in the panel’s Discord settings — by default, anyone who can use slash commands in the channel can invoke them.',
        ],
      },
      {
        type: 'paragraph',
        text: [
          'Commands appear in Discord within a few minutes of the bot connecting; if they don’t show up, verify the bot has the ',
          { type: 'code', text: 'applications.commands' },
          ' scope from when it was invited (added in ',
          { type: 'link', articleId: 'discord-bot-setup', label: 'Discord Bot Setup' },
          ') — the base ',
          { type: 'code', text: 'bot' },
          ' scope alone doesn’t register slash commands.',
        ],
      },
    ],
  },
]
