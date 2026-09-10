# .pulse

A professional, universal Discord moderation and management bot. Built as a single coherent product from accumulated useful functionality across historical variants.

## Overview

.pulse provides a complete suite of server management tools:

- **Moderation** — warn, ban, kick, timeout, cases, history, auto-escalation
- **Tickets** — configurable types, forms, panels, transcripts, claims
- **AutoMod** — spam, links, invites, caps, words, regex, raid protection
- **Leveling** — XP, levels, rewards, leaderboards, prestige
- **Economy** — balance, shop, daily/weekly, trading, inventory
- **Configuration** — modules, logs, roles, prefix, branding
- **Starboard** — reaction-based highlights with modern UI
- **Welcome/Goodbye** — custom messages, autoroles
- **Reaction Roles** — panel-based assignment
- **Giveaways** — creation, management, rerolls
- **Suggestions** — community workflow
- **Orders** — design commission workflow
- **Utilities** — polls, reminders, AFK, diagnostics, analytics

## Architecture

```
src/
  core/          bootstrap, client, registry, services, logger, permissions
  design/        theme, embeds, Components V2 containers (UI system)
  store/         Prisma client
  services/      business logic (23 services)
  commands/      slash commands by module (auto-loaded)
  events/        Discord event handlers (auto-loaded)
  automod/       detector pipeline
prisma/          schema + migrations
docs/            documentation
```

**Single Runtime**: One entry point, one command system, one event system, one service container.

## Stack

- **Runtime**: Node.js 20+ (ESM)
- **Discord**: discord.js v14
- **Database**: SQLite via Prisma ORM (WAL mode, zero-config)
- **Linting**: ESLint (flat config)

## Quick Start

```bash
# Clone and install
git clone https://github.com/LanxTheShowmaker/.pulse.git
cd .pulse
npm install

# Configure
cp .env.example .env
# Edit .env: set DISCORD_TOKEN, DATABASE_URL (default: file:./data.db)

# Database
npm run prisma:generate
npm run prisma:migrate

# Deploy commands (global)
npm run deploy

# Run
npm run start
# Or development with hot reload
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Bot token from Discord Developer Portal |
| `DATABASE_URL` | Yes | `file:./data.db` | SQLite database path |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

## Discord Intents & Permissions

**Required Intents**:
- Guilds
- GuildMembers
- GuildMessages
- GuildBans
- MessageContent
- GuildVoiceStates
- GuildMessageReactions

**Required Bot Permissions**:
- Ban Members, Kick Members, Moderate Members
- Manage Channels, Manage Messages, Manage Roles
- Send Messages, Embed Links, Attach Files
- Read Message History, Use Application Commands

## Configuration

Run `/config` in any server to access the unified configuration center:

- **Modules** — toggle features on/off
- **AutoMod** — rules, thresholds, exemptions
- **Logs** — mod log, general log, welcome, goodbye
- **Staff** — staff roles, moderator roles, ignored channels/roles/users
- **Prefix** — custom command prefix per server

## Design System

.pulse uses Discord's **Components V2** (Containers, Sections, Text Displays, Separators, Media Galleries) as the primary presentation layer. Traditional embeds are used only where they genuinely make more sense.

The design language is:
- **Minimalist** — clean, uncluttered
- **Discord-native** — blurple, green, red, yellow palette
- **Consistent** — shared primitives across all commands
- **Readable** — clear hierarchy, muted secondary text
- **Professional** — no cringe, no excessive emojis, no walls of text

## Command Structure

Commands are organized in intuitive hierarchies:

- `/moderation` — all moderation actions and case management
- `/tickets` — ticket creation, management, configuration
- `/automod` — AutoMod status, rules, thresholds
- `/config` — server settings (alias: `/settings`)
- `/starboard` — starboard configuration
- `/leveling` — rank, leaderboard, configuration
- `/economy` — balance, shop, daily, trading
- `/giveaways` — giveaway management
- `/suggestions` — suggestion workflow
- `/reactionroles` — reaction role panels
- `/welcome` — welcome/goodbye setup
- `/utility` — info, polls, reminders, diagnostics
- `/fun` — games and entertainment
- `/orders` — design order workflow

## Development

```bash
# Syntax check all files
node --check src/core/bootstrap.js
node --check src/core/registry.js
# ... etc

# Lint
npm run lint

# Test (when available)
npm run test

# Auto-reload during development
npm run dev
```

## Deployment

### Production
```bash
npm ci
npm run prisma:deploy
npm run start
```

### Process Management
Recommended: PM2, systemd, or Docker
```bash
pm2 start src/core/bootstrap.js --name pulse
```

### Graceful Shutdown
Handles SIGINT/SIGTERM — disconnects Prisma, destroys Discord client, exits cleanly.

## Documentation

- [Universal Specification](docs/UNIVERSAL_SPEC.md) — canonical product contract
- [Architecture Notes](docs/ARCHITECTURE.md) — technical deep-dive

## License

MIT — see LICENSE file.

---

**.pulse** — Professional Discord Management.