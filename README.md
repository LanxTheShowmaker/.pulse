# .pulse

A free, open-source Discord bot for moderation, tickets, economy, leveling, and more.

Invite the bot: `https://discord.com/oauth2/authorize?client_id=1491757416977534986`

## Features

| Module | What it does |
|--------|-------------|
| **Moderation** | Warn, ban, kick, timeout, case history |
| **Tickets** | Configurable types, panels, transcripts, ratings |
| **AutoMod** | Spam, links, invites, caps, raids |
| **Leveling** | XP, levels, role rewards, leaderboards |
| **Economy** | Balance, daily/weekly, work, crime, slots, shop |
| **Giveaways** | Create, manage, reroll |
| **Starboard** | Reaction-based highlights |
| **Welcome** | Join/leave messages, autoroles |
| **Reaction Roles** | Panel-based role assignment |
| **Suggestions** | Community workflow with approve/deny |
| **Appeals** | Ban appeal system |
| **Achievements** | 25+ unlockable achievements |
| **Utilities** | Polls, reminders, AFK, server info, and more |

## Setup

**Requirements:** Node.js 20+

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

Open `.env` and fill in:
- `DISCORD_TOKEN` — your bot token
- `CLIENT_ID` — your application ID

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Deploy Commands & Run

```bash
npm run deploy    # registers slash commands
npm run start     # starts the bot
```

For development with auto-reload:
```bash
npm run dev
```

## File Structure

```
bot.js              → entry point (run this)
core/               → engine (client, logger, services, deploy)
ui/                 → theme, embeds, components
commands/           → slash commands by category
events/             → discord event handlers
handlers/           → button/menu click handlers
services/           → business logic
prisma/             → database schema
```

## Configuration

Run `/config` in your server to access the settings panel:

- **Modules** — turn features on/off
- **Logs** — set mod log, welcome, goodbye channels
- **Staff** — assign staff roles, set ignored channels
- **Prefix** — custom command prefix
- **Branding** — bot name, avatar, banner per server

## Self-Host

1. Create a bot at [Discord Developer Portal](https://discord.com/developers)
2. Clone this repo and install dependencies
3. Copy `.env.example` to `.env` and fill in your token + app ID
4. Run `npx prisma generate && npx prisma db push`
5. Run `npm run deploy && npm run start`

## License

MIT
