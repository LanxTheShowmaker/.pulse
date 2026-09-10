# .pulse — Architecture Documentation

## Overview

This document describes the technical architecture of .pulse (Pulse Variant 2), a professional Discord moderation and management bot built as a single coherent product.

---

## System Architecture

### Entry Point

```
src/core/bootstrap.js
├── Environment validation (DISCORD_TOKEN, etc.)
├── Prisma Client initialization (WAL mode, busy timeout)
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
| **PulseClient** | `src/core/client.js` | Extended Discord.js Client with services, commands, components collections |
| **Registry** | `src/core/registry.js` | Auto-discovers and loads commands/events |
| **Services** | `src/core/services.js` | Creates all 23 services with explicit dependencies |
| **Logger** | `src/core/logger.js` | Structured logging with levels (debug/info/warn/error) |
| **Permissions** | `src/core/services.js` | isStaff, isModerator, isIgnored helpers |

### Service Layer

Services are created **once** at startup via `createServices(client)`. Each service receives explicit dependencies through constructor injection:

```js
const settings = new SettingsService(prisma, client);
const cases = new CasesService(prisma);
const logging = new LoggingService(prisma, client);
const moderation = new ModerationService(prisma, cases, logging, client);
const automod = new AutomodService(prisma, client, settings, logging);
// ... 18 more services
```

**Key Principles:**
- Services receive only what they need (explicit dependencies)
- No global state access (no `globalThis`, no singleton patterns)
- Services expose intentional interfaces
- Cross-service communication via `client.services`

### Command System

Commands are auto-discovered from `src/commands/**/*.js`:

```js
export default {
    data: SlashCommandBuilder,    // Required
    category: string,              // Required for help
    execute(interaction): Promise<void>,  // Required
    autocomplete?: (interaction) => Promise<void>,  // Optional
    componentHandlers?: Record<string, Function>  // Optional
}
```

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

Events are auto-discovered from `src/events/**/*.js`:

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
- Commands declare `componentHandlers` object
- Registered at startup in `bootstrap.js`
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

**ORM:** Prisma Client
- Single `PrismaClient` instance
- SQLite with WAL mode, busy timeout=5000ms, synchronous=NORMAL
- Connection lifecycle: init at startup, disconnect on shutdown

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
- Init at startup (WAL mode, pragmas)
- Disconnect on graceful shutdown (SIGINT/SIGTERM)
- Single Prisma instance shared across all services

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
moderation.record() → CasesService.create() → Prisma Case.create()
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
TicketService.create() → Prisma Ticket.create()
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

### Why SQLite + WAL?
- Zero-config for most deployments
- WAL mode handles concurrent reads/writes
- Prisma handles migrations reliably

### Why No Silent Catches?
- `.catch(() => {})` hides real problems
- Errors must be logged with context
- Users get safe messages, developers get details

---

## Scaling Considerations

### Current Limits
- SQLite: Good for ~100-500 guilds
- Single Node process: ~1000 guilds with proper sharding

### Future Scaling Path
1. **PostgreSQL** — Swap Prisma datasource, same models
2. **Sharding** — Multiple bot processes, shared DB
3. **Redis** — Caching layer for settings, prefixes
4. **Dashboard** — Separate web service, same Prisma schema

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