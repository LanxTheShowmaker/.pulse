# .pulse — Architecture Documentation

## Overview

This document describes the technical architecture of .pulse (Pulse Variant 2), a professional Discord moderation and management bot built as a single coherent product.

---

## System Architecture

### Entry Point

```
index.js
├── Environment validation (DISCORD_TOKEN, etc.)
├── Database initialization (MySQL connection verify + migrations)
├── Discord Client creation (PulseClient)
├── Service container creation (createServices)
├── Command loading (loadCommands)
├── Event loading (loadEvents)
├── Component handler registration
├── Discord login
└── Graceful shutdown handlers
```

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| **PulseClient** | `core/client.js` | Extended Discord.js Client with services, commands, components collections |
| **Registry** | `core/registry.js` | Auto-discovers and loads commands/events |
| **Services** | `core/services.js` | Creates all 23 services with explicit dependencies |
| **Logger** | `core/logger.js` | Structured logging with levels (debug/info/warn/error) |
| **Permissions** | `core/services.js` | isStaff, isModerator, isIgnored helpers |

### Service Layer

Services are created **once** at startup via `createServices(client)`. Each service receives explicit dependencies through constructor injection:

```js
const settings = new SettingsService(db, client);
const cases = new CasesService(db);
const logging = new LoggingService(db, client);
const moderation = new ModerationService(db, cases, logging, audit, client);
const automod = new AutoModService(db, client, settings, logging);
// ... 18 more services
```

**Key Principles:**
- Services receive only what they need (explicit dependencies)
- No global state access (no `globalThis`, no singleton patterns)
- Services expose intentional interfaces
- Cross-service communication via `client.services`

### Command System

Commands are auto-discovered from `commands/**/*.js`:

```js
export default {
    data: SlashCommandBuilder,    // Required
    category: string,              // Required for help
    execute(interaction): Promise<void>,  // Required
    autocomplete?: (interaction) => Promise<void>,  // Optional
}
```

Component (button/select/modal) handlers live in `handlers/*.js`, not on the
command itself.

Commands are loaded at startup, serialized for validation, and registered with Discord.

**Command Hierarchy:**
```
/moderation (warn, ban, kick, timeout, un*, case, cases, history, stats, note, cleanup, lock, unlock, raid, fortress, appeal)
/tickets (config, create-type, edit-type, delete-type, panel)
/automod (status, config, rules, thresholds, exemptions)
/config (view, modules, automod, logs, staff, prefix)
/starboard (set, view, disable)
/welcome (setup, test, disable)
/leveling (rank, leaderboard, weekly, config, rewards)
/economy (balance, daily, weekly, shop, buy, sell, trade, gift, history)
/giveaways (create, end, reroll, list)
/suggestions (create, approve, reject, list)
/reactionroles (create, list, remove)
/utility (help, about, ping, info, whois, profile, serverinfo, poll, remind, afk, invite, banner, avatar, purge, slowmode, uptime, health, diagnostics, analytics, achievements, leaderboard)
/fun (8ball, coinflip, hug, joke, meme, roll, rps, ship, trivia)
/orders (create, list, claim, complete, cancel)
```

### Event System

Events are auto-discovered from `events/**/*.js`:

```js
export default {
    name: "eventName",
    once?: boolean,  // Optional, for one-time events
    async execute(...args, client) { ... }
}
```

**Registered Events:**
- `ready` (once) — Startup, branding reapply
- `interactionCreate` — Commands, autocomplete, components, modals
- `messageCreate` — Prefix commands, XP, automod, AFK
- `messageDelete` — Logging
- `messageUpdate` — Logging, automod edit detection
- `messageReactionAdd` — Starboard, reaction roles
- `guildMemberAdd` — Welcome, autorole, raid detection
- `guildMemberRemove` — Goodbye, logging
- `guildCreate` — Initial config warmup

**Canonical Signature:** `async execute(...args, client)`

### Component System

Components V2 (Containers) are the primary UI layer.

**Custom ID Format:** `feature:action[:param1[:param2...]]`

Examples:
- `mod:ban:confirm:userId:caseNumber`
- `ticket:create:select`
- `settings:module:toggle:automod`
- `help:category:moderation`

**Registration:**
- Handlers are exported from `handlers/*.js` (as a Map, array, or plain object)
- Registered at startup in `index.js`
- No dynamic registration during runtime

**Resolution:**
```js
function resolveComponent(client, customId) {
    if (client.components.has(customId)) return client.components.get(customId);
    for (const [key, handler] of client.components) {
        if (customId === key || customId.startsWith(key + ":"))
            return handler;
    }
    return undefined;
}
```

**Supported Components:**
- Buttons (Primary, Secondary, Success, Danger, Link)
- Select Menus (String, Channel, Role, User, Mentionable)
- Modals (Text inputs: short, paragraph)

### Database Layer

**ORM:** Drizzle ORM (MySQL)
- Single `drizzle-orm` instance over a `mysql2` connection pool
- Connection lifecycle: init at startup, disconnect on shutdown
- Migrations: hand-written idempotent SQL in `db/migrate.js`

**Key Models:**
- `GuildConfig` — Per-server settings, modules, roles, channels
- `GuildBranding` — Per-server bot identity
- `Case` — Moderation cases
- `Ticket` / `TicketType` — Ticket system
- `Xp` / `LevelConfig` — Leveling
- `Economy` / `EconomyConfig` — Economy
- `Giveaway` — Giveaway lifecycle
- `AuditLog` — System audit trail
- `ReactionRole` — Reaction role mappings
- `StarboardConfig` — Starboard settings
- `Panel` — Configurable panels
- `Ticket` / `TicketType` — Ticket system
- `Order` — Design orders
- `Giveaway` / `Suggestion` / `StarboardConfig` / `Afk` / `LevelConfig` / `EconomyConfig` / `AuditLog` / `Achievement` / `UserAchievement` / `AutomationRule` / `Backup` / `RaidIncident` / `XpStreak`

**Connection Management:**
- Init at startup (`initDatabase` verifies the connection and migrates)
- Disconnect on graceful shutdown (SIGINT/SIGTERM)
- Single drizzle instance shared across all services

---

## Data Flow Examples

### Moderation Action (e.g., `/moderation ban`)

```
User executes /moderation ban @user reason:"spam"
        ↓
interactionCreate event → command.execute(interaction)
        ↓
requireModerator() permission check
        ↓
confirmAction() → confirmation panel with buttons
        ↓
User clicks "Confirm Ban"
        ↓
component handler → client.services.moderation.ban(guild, target, moderator, reason, deleteDays)
        ↓
moderation.record() → CasesService.create() → drizzle insert into Case
        ↓
logging.logCase() → sends to mod log channel
        ↓
audit.log() + automation.trigger()
        ↓
sendActionResult() → moderationActionPanel container → interaction.editReply()
```

### AutoMod Pipeline

```
messageCreate event
        ↓
prefix.handleMessage() — check for prefix commands first
        ↓
config.modules.automod check
        ↓
isIgnored(member, config) check
        ↓
AutomodEngine.handleMessage(message)
        ↓
normalize(message.content) → text processing
        ↓
detectors.run() → [spam, caps, links, invites, mentions, emoji, words, regex, duplicate, raid]
        ↓
exemptions.check(member, config)
        ↓
action.execute() → warn/timeout/kick/ban
        ↓
escalation.record() → check thresholds → auto-escalate if needed
        ↓
case created via moderation.record()
        ↓
logging + audit + automation triggers
```

### Ticket Creation

```
User selects type from panel dropdown
        ↓
panel:select component handler
        ↓
If questions exist → show modal
        ↓
User submits modal → createTicket()
        ↓
uniqueChannelName() → guild.channels.create()
        ↓
TicketService.create() → drizzle insert into Ticket
        ↓
welcome embed + ticket controls (claim, close, add, remove, transcript, priority, status)
        ↓
log to mod channel
```

---

## Design Decisions

### Why Single Runtime?
- Eliminates branch-dependent behavior (`if (branch === "cherub")`)
- Simpler deployment, debugging, testing
- One source of truth

### Why Explicit Service Dependencies?
- Avoids hidden initialization order issues
- Makes testing easier (inject mocks)
- Clear ownership boundaries

### Why Components V2?
- Better UX for complex interactions
- Native Discord components (no embed hacks)
- Accessibility-friendly (screen readers)

### Why MySQL?
- Standard, well-supported relational database with mature tooling
- Handles concurrent writes safely (no single-writer SQLite bottleneck)
- Drizzle provides type-safe queries and predictable SQL

### Why No Silent Catches?
- `.catch(() => {})` hides real problems
- Errors must be logged with context
- Users get safe messages, developers get details

---

## Scaling Considerations

### Current Limits
- Single Node process: ~1000 guilds with proper sharding

### Future Scaling Path
1. **PostgreSQL** - Swap the Drizzle driver, same schema definitions
2. **Sharding** — Multiple bot processes, shared DB
3. **Redis** — Caching layer for settings, prefixes
4. **Dashboard** - Separate web service, same DB schema

---

## Security

- No tokens/secrets in code (`.env` only)
- Input validation on all user-provided data
- Permission checks at command + action level
- Hierarchy checks (can't moderate higher/equal roles)
- Bot permission verification before actions
- No `eval`, `Function`, or dynamic code execution

---

## Monitoring

- Structured logging with levels
- Per-service error tracking
- Discord message acknowledgment handling
- Graceful shutdown on SIGINT/SIGTERM

---

*This architecture document is maintained alongside the codebase. Update when making structural changes.*
