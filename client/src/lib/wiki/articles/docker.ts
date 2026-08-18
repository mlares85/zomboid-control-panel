import type { WikiArticle } from '../types'

export const articles: WikiArticle[] = [
  {
    id: 'docker-overview',
    title: 'Docker Overview',
    category: 'docker',
    summary: 'How the panel works with Dockerized Project Zomboid servers.',
    tags: ['docker', 'containers', 'overview'],
    related: ['docker-managed-containers', 'docker-local-bind-mounts', 'orbstack-macos'],
    content: [
      {
        type: 'paragraph',
        text: [
          'Running a Project Zomboid server in Docker keeps the game process isolated from the host, makes upgrades and restarts predictable, and lets the panel manage the container lifecycle (start, stop, restart) alongside the game itself. The panel supports two Docker setups, and it’s important to know which one you have.',
        ],
      },
      { type: 'heading', level: 2, text: 'Two ways the panel talks to Docker' },
      {
        type: 'list',
        items: [
          [{ type: 'bold', text: 'Panel-managed containers' }, ' — the panel created and owns the container (via ', { type: 'code', text: 'docker run' }, ' or an equivalent), and can start/stop/recreate it directly. See ', { type: 'link', articleId: 'docker-managed-containers', label: 'Panel-Managed Containers' }, '.'],
          [{ type: 'bold', text: 'Local bind mounts' }, ' — the server files live on a mounted volume that both the container and the panel’s host can see, but the container itself may be managed outside the panel (docker-compose, a separate stack). See ', { type: 'link', articleId: 'docker-local-bind-mounts', label: 'Local Bind Mounts' }, '.'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: [
          'Neither mode is “better” — panel-managed is simpler for a single dedicated server; bind mounts fit better if you already run a docker-compose stack or use an orchestrator like Portainer.',
        ],
      },
      { type: 'heading', level: 2, text: 'What Docker mode unlocks' },
      {
        type: 'list',
        items: [
          ['Container status (running / stopped / crashed) shown directly in the panel, distinct from “is the game process responding to RCON.”'],
          ['Start, stop, and restart controls that operate on the container, not just the game process inside it.'],
          ['Log streaming pulled from the container’s stdout, useful when the game process itself won’t start.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'The panel itself doesn’t need to run inside the same container as the game server, but it does need access to the Docker socket (or an equivalent API) to manage containers, and filesystem access to the server’s mounted data for config, mods, and backups.',
        ],
      },
      { type: 'heading', level: 2, text: 'macOS note' },
      {
        type: 'paragraph',
        text: [
          'Docker Desktop and OrbStack behave slightly differently around volume performance and socket paths — see ',
          { type: 'link', articleId: 'orbstack-macos', label: 'OrbStack on macOS' },
          ' if you’re developing or running the panel on a Mac.',
        ],
      },
    ],
  },
  {
    id: 'docker-managed-containers',
    title: 'Panel-Managed Containers',
    category: 'docker',
    summary: 'Letting the panel create and control the server container directly.',
    tags: ['docker', 'container', 'managed', 'lifecycle'],
    related: ['docker-overview', 'docker-local-bind-mounts'],
    content: [
      {
        type: 'paragraph',
        text: [
          'In this mode, the panel creates the container for you during ',
          { type: 'bold', text: 'Server Setup' },
          ' — pulling the image, configuring the port mappings and volumes, and starting it. From then on, the panel’s start/stop/restart buttons act directly on that container.',
        ],
      },
      { type: 'heading', level: 2, text: 'What gets created' },
      {
        type: 'list',
        items: [
          ['A named container tied to the server profile.'],
          ['A data volume (or bind mount) for the server’s save files, config, and mods so they survive container recreation.'],
          ['Port mappings for the game port, RCON port, and Steam query port — the panel picks sensible defaults but you can override them if they conflict with something else on the host.'],
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: [
          'Because the data lives on a persistent volume, recreating the container (e.g. to pick up a new image) does not lose your world. Deleting the ',
          { type: 'bold', text: 'volume' },
          ' does.',
        ],
      },
      { type: 'heading', level: 2, text: 'Updating the server' },
      {
        type: 'paragraph',
        text: [
          'A managed container is updated by pulling a new image and recreating the container with the same volume attached — the panel’s update flow does this for you. This is different from a bare-metal SteamCMD update; see ',
          { type: 'link', articleId: 'steamcmd-deep-dive', label: 'SteamCMD Deep Dive' },
          ' for how the underlying update mechanics work either way.',
        ],
      },
      { type: 'heading', level: 2, text: 'Common pitfalls' },
      {
        type: 'list',
        items: [
          ['Port conflicts — if another service on the host already uses the chosen port, the container will fail to start. The panel surfaces this as a start failure with the conflicting port in the error.'],
          ['Editing the server config from ', { type: 'bold', text: 'outside' }, ' the panel (directly on disk) works fine as long as you’re editing the mounted volume path, not a stale copy elsewhere.'],
          ['If the container shows “running” but RCON never connects, check that the RCON port was actually published — not just exposed — when the container was created.'],
        ],
      },
    ],
  },
  {
    id: 'docker-local-bind-mounts',
    title: 'Local Bind Mounts',
    category: 'docker',
    summary: 'Using the panel against a server whose files are on a mounted volume.',
    tags: ['docker', 'bind mount', 'volume', 'compose'],
    related: ['docker-overview', 'docker-managed-containers'],
    content: [
      {
        type: 'paragraph',
        text: [
          'If you already run your server via docker-compose, Portainer, or another orchestrator, you can point the panel at the server’s data directory as a bind mount rather than letting the panel create and own the container. The panel reads and writes config, mods, and backups directly on that path.',
        ],
      },
      { type: 'heading', level: 2, text: 'Setting it up' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Make sure the panel’s host filesystem has read/write access to the same path your compose stack mounts into the container (e.g. ', { type: 'code', text: '/srv/zomboid/server' }, ').'],
          ['Add the server as a local profile pointing at that path, rather than using Server Setup to create a new container.'],
          ['Enter RCON credentials that match the ones your existing compose stack already uses — see ', { type: 'link', articleId: 'rcon-setup', label: 'RCON Setup' }, '.'],
        ],
      },
      {
        type: 'callout',
        tone: 'warning',
        text: [
          'The panel won’t control container lifecycle (start/stop/restart) for a bind-mount-only server unless you also give it Docker socket access and identify the container name — otherwise “stop” in the panel can only stop the game process, not the container itself.',
        ],
      },
      { type: 'heading', level: 2, text: 'File permission gotchas' },
      {
        type: 'paragraph',
        text: [
          'The most common issue with bind mounts is UID/GID mismatch: the container process writes files as one user, and the panel (running as a different user on the host) can’t write to them. If config saves or mod installs fail with permission errors, check that both the panel process and the container’s process share a UID, or that the mount directory is group-writable by both.',
        ],
      },
    ],
  },
  {
    id: 'orbstack-macos',
    title: 'OrbStack on macOS',
    category: 'docker',
    summary: 'Notes for running Docker workloads on macOS via OrbStack.',
    tags: ['macos', 'orbstack', 'docker desktop', 'development'],
    related: ['docker-overview'],
    content: [
      {
        type: 'paragraph',
        text: [
          'OrbStack is a lightweight Docker Desktop alternative for macOS. It’s a good fit for running the panel and/or a Project Zomboid server locally on a Mac for development or testing, with noticeably better filesystem performance for bind mounts than Docker Desktop’s default virtualization.',
        ],
      },
      { type: 'heading', level: 2, text: 'Why it matters here' },
      {
        type: 'list',
        items: [
          ['Bind-mounted volumes (server saves, mod caches) are read/written far more often under real gameplay than most workloads — slow filesystem passthrough shows up as save lag or long mod installs.'],
          ['OrbStack exposes the same Docker socket API, so the panel’s Docker integration works identically to Docker Desktop; no code changes are needed to switch.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Switching from Docker Desktop' },
      {
        type: 'list',
        ordered: true,
        items: [
          ['Install OrbStack and quit Docker Desktop (both can’t hold the default socket at once).'],
          ['Existing containers and volumes created under Docker Desktop are visible to OrbStack — no migration step is required for named volumes.'],
          ['Re-check any paths hardcoded to ', { type: 'code', text: '~/Library/Containers/com.docker.docker' }, ' — OrbStack’s data lives elsewhere, so tools that assumed the old path will need reconfiguring.'],
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: [
          'Apple Silicon vs. Intel images matter here too — Project Zomboid’s dedicated server image may only ship for one architecture. If a container fails to start with an “exec format error,” you’re pulling the wrong architecture image; force the correct platform when pulling.',
        ],
      },
    ],
  },
]
