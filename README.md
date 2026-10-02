# .pulse

A free, open-source Discord bot for moderation, tickets, economy, leveling, and more.

Invite the bot: `https://discord.com/oauth2/authorize?client_id=1491757416977534986`

## Features

| Module | What it does |
|--------|-------------|
| **Moderation** | Warn, ban, kick, timeout, case history |
| **Tickets** | Configurable types, panels, transcripts, ratings |
| **AutoMod** | Spam, links, invites, caps, mass mentions, duplicates |
| **Leveling** | XP, levels, role rewards, leaderboards |
| **Economy** | Balance, daily/weekly, work, crime, slots, shop |
| **Giveaways** | Create, manage, reroll |
| **Starboard** | Reaction-based highlights |
| **Welcome** | Join/leave messages |
| **Reaction Roles** | Panel-based role assignment |
| **Suggestions** | Community workflow with approve/deny |
| **Appeals** | Ban appeal system |
| **Achievements** | 25+ unlockable achievements |
| **Utilities** | Polls, reminders, AFK, server info, and more |

Plus a **web dashboard** (Express + vanilla JS) for managing tickets, moderation
cases, mod logs, and per-guild settings over OAuth2 login.

## Requirements

- **Node.js 22.19+** (`>=22.19.0`; the discord.js v15 line also declares `>=24.17.0`)
- **MySQL 8+** (or MariaDB 10.6+) — the database layer is Drizzle ORM over MySQL

## Setup

```bash
git clone https://github.com/LanxTheShowmaker/.pulse.git
cd .pulse
npm install
```

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers)
2. Create a new application → Bot → copy the token
3. Under OAuth2, copy the Application ID
4. Enable these **Privileged Gateway Intents**:
   - Server Members
   - Message Content
   - Server Bans

### 2. Configure

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_TOKEN` | yes | Bot token from the Developer Portal |
| `CLIENT_ID` | yes | Application ID |
| `DATABASE_URL` | yes | `mysql://user:password@host:3306/database` |
| `DISCORD_CLIENT_ID` | dashboard | Same as `CLIENT_ID`; used for dashboard OAuth2 |
| `DISCORD_CLIENT_SECRET` | dashboard | OAuth2 client secret |
| `DISCORD_REDIRECT_URI` | dashboard | Must match a redirect URI registered in the portal |
| `SESSION_SECRET` | dashboard | Cookie signing secret — generate with `openssl rand -hex 32` |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` (default `info`) |
| `DASHBOARD_PORT` | no | Dashboard port (default `9875`) |

The bot itself runs without the four dashboard variables; they are only needed
for the web dashboard.

### 3. Set Up the Database

Create the database, then run the idempotent migration. It runs automatically on
every boot, but you can also trigger it manually:

```bash
npm run db:migrate
```

Migrations use `CREATE TABLE IF NOT EXISTS` and are safe to re-run.

If the bot exits with `MySQL connection failed`, diagnose it without booting:

```bash
npm run db:check
```

It reports the precise cause — refused / DNS / timeout / bad credentials /
missing database — plus the exact fix. A common container mistake is using
`127.0.0.1` when MySQL runs elsewhere; use the service hostname or host IP.

<details>
<summary>Migrating from the legacy SQLite database</summary>

The project previously used Prisma + SQLite. To copy existing data into MySQL:

```bash
node db/migrate-data.mjs ./path/to/legacy.db
```

The path defaults to `./prisma/pulse.db` and can also be set with
`LEGACY_SQLITE_PATH`. Tables that already contain rows are skipped, so it is
safe to re-run. The SQLite file is never modified.
</details>

### 4. Deploy Commands & Run

```bash
npm run deploy    # registers slash commands globally
npm start         # starts the bot
```

`npm run deploy` also accepts a guild for instant, non-propagating registration:

```bash
npm run deploy -- --guild 123456789012345678
node core/deploy.js --guild 123456789012345678   # -g works too
```

Use the space-separated form — npm treats `--guild=<id>` as its own config flag
and strips it. With no arguments the commands are registered globally, which can
take up to an hour to propagate.

For development with auto-reload:

```bash
npm run dev
```

### 5. Dashboard (optional)

The dashboard starts automatically alongside the bot when its OAuth variables
are configured. To run it standalone (web only, no Discord gateway):

```bash
npm run dashboard
```

The dashboard is part of this package and resolves its dependencies from the
root `node_modules` — there is no separate install step.

## File Structure

```
index.js             → entry point (run this)
core/                → engine (client, logger, registry, services, deploy)
db/                  → Drizzle schema + idempotent migrations
ui/                  → Discord theme, embeds, components
commands/            → slash commands by category
events/              → discord event handlers
handlers/            → button/select/modal handlers
services/            → business logic
dashboard/           → Express web dashboard (server/ + public/)
data/                → runtime file state (giveaways.json)
docs/                → architecture and feature documentation
```

## Configuration

Run `/config` in your server to access the settings panel:

- **Modules** — turn features on/off
- **Logs** — set mod log, welcome, goodbye channels
- **Staff** — assign staff roles, set ignored channels
- **Prefix** — custom command prefix
- **Branding** — bot name, avatar, banner per server

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run the bot |
| `npm run dev` | Run with auto-reload |
| `npm run dashboard` | Run the dashboard standalone (no gateway) |
| `npm run deploy` | Register slash commands |
| `npm run db:migrate` | Run database migrations |
| `npm run db:check` | Diagnose MySQL connectivity |
| `npm run lint` | Lint the codebase |
| `npm test` | Run the test suite |

## Dependency notes

`.pulse` targets the **discord.js v15 prerelease**, published under the
`pr-11602` dist-tag rather than `latest`:

```bash
npm install discord.js@pr-11602 @discordjs/rest@pr-11602 @discordjs/ws@pr-11602 \
  @discordjs/util@pr-11602 @discordjs/collection@pr-11602 @discordjs/formatters@pr-11602
```

> **Do not run `npm update discord.js` or `npm-check-updates -u`.**
> On npm, `latest` for every `@discordjs/*` package is the **v14 line**
> (`discord.js@14.27.0` requires `@discordjs/builders@^1.14.1`). Upgrading
> "to latest" therefore *downgrades* the codebase to v14 and breaks it — this
> project uses v15-only APIs (`MessageFlags.Ephemeral`, Components V2).
> The versions in `package.json` are exact pins on purpose.

## License

MIT