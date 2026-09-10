# .pulse — Universal Specification

**Product**: .pulse  
**Variant**: Pulse Variant 2  
**Version**: 2.0.0  
**Status**: Active Development

---

## 1. Product Scope

.pulse is a professional, universal Discord moderation and management bot. It provides a complete suite of server management tools including moderation, ticketing, automod, leveling, economy, and configuration systems — all through a single, coherent architecture.

**Target**: Discord servers requiring professional moderation and community management  
**Architecture**: Single runtime, single command system, single event system, single service layer  
**Deployment**: Self-hosted (Node.js 20+, SQLite via Prisma)

---

## 2. Supported Capabilities

### 2.1 Moderation
- **Actions**: warn, ban, kick, timeout, mute, unmute, unban, untimeout, unwarn, softban
- **Case System**: Sequential case numbers per guild, full history, notes, appeals
- **Auto-Escalation**: Configurable thresholds (warn→timeout→kick→ban)
- **Expiration Handling**: Automatic timeout removal, case resolution
- **Logging**: Structured moderation logs with case references

### 2.2 Ticket System
- **Types**: Configurable ticket types with custom fields, categories, staff roles
- **Creation**: Dropdown selection, modal forms, per-type cooldowns/limits
- **Management**: Claim, unclaim, close, reopen, transfer, priority
- **Transcripts**: HTML archive on close
- **Panels**: Deployable ticket creation panels with Components V2

### 2.3 AutoMod
- **Detectors**: spam, caps, links, invites, mentions, emoji spam, words, regex, duplicates, raid
- **Configuration**: Per-rule enable/disable, action (warn/timeout/kick/ban), thresholds
- **Exemptions**: Roles, channels, users
- **Escalation**: Integrated with moderation thresholds
- **Performance**: Optimized for high-volume servers

### 2.4 Leveling & Economy
- **XP System**: Message-based XP with cooldowns, multipliers, anti-farm
- **Levels**: Configurable formulas, role rewards, prestige system
- **Economy**: Balance, daily/weekly, shop (role items), trading, transactions
- **Leaderboards**: Per-guild and global

### 2.5 Configuration
- **Modules**: Toggleable feature modules (13 modules)
- **Log Channels**: Mod log, general log, welcome, goodbye
- **Staff Roles**: Staff, moderator, ignored roles/users/channels
- **Prefix**: Per-server custom prefix
- **Branding**: Per-server bot name, avatar, banner, nickname

### 2.6 Additional Features
- **Starboard**: Reaction-based message highlighting with Components V2
- **Welcome/Goodbye**: Custom messages, autoroles, embeds
- **Reaction Roles**: Panel-based role assignment
- **Giveaways**: Creation, management, winner selection, rerolls
- **Suggestions**: Community suggestion system with status tracking
- **Orders**: Design order workflow (brief, claim, delivery)
- **Analytics**: Server statistics, diagnostics
- **AFK**: Per-user AFK status
- **Reminders/Polls**: User and server utilities
- **Automation**: Trigger-based workflows
- **Backup/Restore**: Configuration backup system

---

## 3. Command Architecture

### 3.1 Command Hierarchy

```
/moderation
    warn, ban, kick, timeout, mute, unmute
    unban, untimeout, unwarn, softban
    case, cases, casenote, modhistory, modstats
    cleanup, lock, unlock, raid, security, fortress

/tickets
    create, close, reopen, claim, unclaim, transfer
    config, types, panel, list

/automod
    status, config, rules, thresholds, exemptions

/settings (or /config)
    view, modules, automod, logs, staff, prefix

/starboard
    set, view, disable

/welcome
    setup, test, disable

/leveling
    rank, leaderboard, weekly, config, rewards

/economy
    balance, daily, weekly, shop, buy, sell, trade, gift, history

/giveaways
    create, end, reroll, list

/suggestions
    create, approve, reject, list

/reactionroles
    create, list, remove

/utility
    help, about, ping, info, whois, profile, userinfo, serverinfo
    poll, remind, schedule, afk, invite, banner, avatar
    purge, slowmode, uptime, health, diagnostics, analytics
    achievements, leaderboard

/fun
    8ball, coinflip, hug, joke, meme, roll, rps, ship, trivia

/orders
    create, list, claim, complete, cancel
```

### 3.2 Command Contracts

Every command MUST export:
```js
{
    data: SlashCommandBuilder,  // Required
    category: string,           // Required for help system
    execute(interaction): Promise<void>,  // Required
    autocomplete?(interaction): Promise<void>,  // Optional
    componentHandlers?: Record<string, Function>  // Optional
}
```

### 3.3 Interaction Policy
- **Ephemeral**: Only for sensitive data (config, moderation confirmations, private info)
- **Public**: Informational commands, help, general queries
- **Defer**: Use for operations > 2 seconds
- **FollowUp**: For multi-step flows

---

## 4. Event Contracts

### 4.1 Canonical Event Signature
```js
async execute(...args, client) {
    // args: Discord.js native event arguments
    // client: PulseClient instance with services, commands, components
}
```

### 4.2 Registered Events
| Event | Purpose |
|-------|---------|
| `ready` | Startup initialization, branding reapply |
| `interactionCreate` | Commands, autocomplete, buttons, selects, modals |
| `messageCreate` | Prefix commands, XP, automod, AFK |
| `messageDelete` | Logging, snipe |
| `messageUpdate` | Logging, edit detection |
| `messageReactionAdd` | Starboard, reaction roles |
| `messageReactionRemove` | Starboard cleanup |
| `guildMemberAdd` | Welcome, autorole, raid detection |
| `guildMemberRemove` | Goodbye, logging |
| `guildCreate` | Initial setup |

### 4.3 Event Registration
- Events loaded from `src/events/**/*.js`
- Registered once at startup via `registry.js`
- No duplicate listeners — enforced by registry

---

## 5. Service Contracts

### 5.1 Service Container
Created once at startup via `createServices(client)`. Returns object with all services + `prisma`.

### 5.2 Core Services
| Service | Responsibility |
|---------|----------------|
| `settings` | Guild configuration CRUD |
| `cases` | Moderation case persistence |
| `moderation` | Ban/kick/timeout/warn execution |
| `logging` | Structured log delivery |
| `automod` | Message filtering pipeline |
| `tickets` | Ticket lifecycle management |
| `welcome` | Join/leave handling |
| `starboard` | Reaction starboard |
| `leveling` | XP, levels, rewards |
| `economy` | Balance, shop, transactions |
| `reactionRoles` | Reaction role panels |
| `giveaways` | Giveaway lifecycle |
| `suggestions` | Suggestion workflow |
| `orders` | Design order workflow |
| `prefix` | Per-server prefix |
| `branding` | Per-server bot identity |
| `analytics` | Server statistics |
| `diagnostics` | Health checks |
| `backup` | Config backup/restore |
| `automation` | Trigger-action workflows |
| `raidProtection` | Mass-join detection |
| `achievements` | Achievement tracking |
| `intelligence` | ML-assisted features |
| `fortress` | Server lockdown |
| `afk` | AFK status |

### 5.3 Service Dependencies
Explicit constructor injection — no global state access. Services receive only what they need.

---

## 6. Component System

### 6.1 Custom ID Format
```
feature:action[:param1[:param2...]]
```

Examples:
- `mod:ban:confirm:userId:caseNumber`
- `ticket:create:select`
- `settings:module:toggle:automod`
- `help:category:moderation`

### 6.2 Component Registration
- Commands declare `componentHandlers` object
- Registered at startup in `bootstrap.js`
- No dynamic registration during runtime

### 6.3 Supported Components
- **Buttons**: Primary, Secondary, Success, Danger, Link
- **Select Menus**: String, Channel, Role, User, Mentionable
- **Modals**: Text inputs (short, paragraph)

### 6.4 Resolution
`resolveComponent(client, customId)` — exact match OR prefix match (`customId.startsWith(key + ":")`)

---

## 7. Database Layer

### 7.1 ORM: Prisma Client
- Single `PrismaClient` instance
- SQLite with WAL mode, busy timeout, synchronous=NORMAL
- Connection lifecycle: init at startup, disconnect on shutdown

### 7.2 Key Models
| Model | Purpose |
|-------|---------|
| `GuildConfig` | Per-server settings, modules, roles, channels |
| `GuildBranding` | Per-server bot identity |
| `Case` | Moderation cases |
| `CaseNote` | Case annotations |
| `Appeal` | Case appeals |
| `Ticket` | Active tickets |
| `TicketType` | Ticket type definitions |
| `Xp` | User XP/level |
| `Economy` | User balance |
| `ShopItem` | Shop inventory |
| `Giveaway` | Active giveaways |
| `Suggestion` | Suggestions |
| `StarboardConfig` | Starboard settings |
| `ReactionRole` | Reaction role mappings |
| `LevelConfig` | Leveling settings |
| `EconomyConfig` | Economy settings |
| `AuditLog` | System audit trail |
| `Achievement` / `UserAchievement` | Achievements |
| `AutomationRule` | Automation workflows |
| `Backup` | Configuration backups |
| `RaidIncident` | Raid detection logs |

---

## 8. Configuration System

### 8.1 Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token |
| `DATABASE_URL` | Yes | SQLite path (e.g., `file:./data.db`) |
| `LOG_LEVEL` | No | debug/info/warn/error (default: info) |

### 8.2 Validation
- Required vars validated at startup
- Missing required → clear error + exit(1)
- `.env.example` maintained in sync

---

## 9. Permission Model

### 9.1 Authorization Functions
```js
isStaff(member, config)      // Admin | ManageGuild | staffRole | modRole
isModerator(member, config)  // BanMembers | KickMembers | ModerateMembers | modRole
isIgnored(member, config)    // ignoredUserIds | ignoredRoleIds
```

### 9.2 Command-Level Permissions
- Slash command `defaultMemberPermissions` for admin-only commands
- Runtime checks via `requireModerator()` / `requireStaff()`
- Bot permission verification before actions
- Hierarchy checks (can't moderate higher/equal roles)

---

## 10. Logging System

### 10.1 Logger Interface
```js
logger.debug(scope, message, meta)
logger.info(scope, message, meta)
logger.warn(scope, message, meta)
logger.error(scope, message, meta)
```

### 10.2 Output Format
```
[ISO_TIMESTAMP] LEVEL   SCOPE        MESSAGE [META]
```

### 10.3 Log Levels
- `debug`: Verbose diagnostic
- `info`: Normal operations
- `warn`: Recoverable issues
- `error`: Failures requiring attention

### 10.4 Discord Logging
- Moderation actions → mod log channel
- Message deletions/edits → general log
- Member join/leave → welcome/goodbye channels
- AutoMod triggers → mod log
- Errors → console + mod log (sanitized)

---

## 11. Error Handling

### 11.1 Principles
- **No silent failures**: No empty `catch() {}` without justification
- **User-safe**: Users never see stack traces
- **Developer-visible**: Full context in logs
- **Graceful degradation**: Partial failure ≠ total failure

### 11.2 Interaction Errors
```js
try {
    // operation
} catch (e) {
    logger.error("feature", "operation failed", e);
    const reply = errorPanel("Failed", "Action could not be completed.");
    if (interaction.replied || interaction.deferred)
        await interaction.followUp({ components: [reply], flags: 64 });
    else
        await interaction.reply({ components: [reply], flags: 64 });
}
```

### 11.3 Event Errors
- Logged with scope + context
- Never crash the event loop
- Client remains connected

---

## 12. Deployment System

### 12.1 Command Deployment
- Source: `client.commands` Collection (same as runtime)
- Script: `npm run deploy` → `src/core/deploy.js`
- Supports: Guild-specific + global
- Cleanup: Removes unregistered commands

### 12.2 Database Migration
- `npm run prisma:migrate` (dev)
- `npm run prisma:deploy` (production)

---

## 13. UX Principles

### 13.1 Design Language
- **Minimalist**: Clean, uncluttered
- **Monochrome**: Discord-native colors (blurple, green, red, yellow)
- **Consistent**: Shared Components V2 primitives
- **Readable**: Clear hierarchy, muted secondary text
- **Professional**: No cringe, no excessive emojis, no walls of text

### 13.2 Container-Based UI
- **Primary**: Components V2 Containers for structured UI
- **Secondary**: Traditional embeds where appropriate
- **Tertiary**: Plain text for simple responses

### 13.3 Interaction Patterns
- **Confirmations**: Danger-style buttons for destructive actions
- **Pagination**: Prev/Next buttons with page indicator
- **Selection**: Dropdown menus for multi-option choices
- **Forms**: Modals for text input

---

## 14. Startup Sequence

1. Load `.env` configuration
2. Validate required environment variables
3. Initialize Prisma Client (WAL, timeouts)
4. Create `PulseClient` with intents/partials
5. Create service container (`createServices`)
6. Load commands (`loadCommands`)
7. Load events (`loadEvents`)
8. Register command component handlers
9. Register event listeners
10. Login to Discord
11. Log successful startup
12. Set up graceful shutdown handlers

---

## 15. Shutdown Sequence

1. Receive SIGINT/SIGTERM
2. Log shutdown signal
3. Disconnect Prisma
4. Destroy Discord client
5. Exit process

---

## 16. Development Standards

### 16.1 Code Style
- ESLint (flat config)
- No unused imports/variables (warnings)
- ES Modules only
- JSDoc for public APIs

### 16.2 Testing
- `node --check` on all files
- Syntax validation on load
- Duplicate command detection
- Event contract verification

### 16.3 Prohibited Patterns
- `.catch(() => {})` without comment
- Dynamic `require()` / `import()` in hot paths
- Global mutable state
- Branch-dependent runtime logic (`if (branch === "cherub")`)
- Multiple competing implementations

---

## 17. Migration Notes

### From Legacy Branches (master/cherub/seraph)
- All feature branches merged into single universal implementation
- Hosting-specific optimizations moved to deployment configs
- Legacy branding (A.N.G.E.L., Wings, Cherub, Seraph) removed
- Branch-aware command loading removed
- Single entry point: `src/core/bootstrap.js`

### Breaking Changes
- Package renamed: `angel` → `@pulse/bot`
- Client class: `WingsClient` → `PulseClient`
- Theme colors: Discord-native palette
- Brand: `.pulse` / `Pulse Variant 2`
- Component IDs: Namespaced format
- UI: Components V2 Containers primary

---

## 18. Future Considerations

- PostgreSQL support (multi-server scaling)
- Dashboard web interface
- Plugin/extension system
- Multi-language support
- Advanced analytics dashboard
- Mobile app companion

---

*This specification defines what .pulse IS. The implementation fulfills this specification.*