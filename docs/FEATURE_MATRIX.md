# Feature Matrix — .pulse (Pulse Variant 2)

## Branch Comparison

| Feature Area | main/master | cherub | seraph | Universal (Pulse V2) |
|--------------|-------------|--------|--------|----------------------|
| **Core Runtime** | ✅ | ✅ (256MB heap) | ✅ (4GB heap, Pi pragmas) | ✅ Single universal |
| **Command System** | ✅ Full | ✅ Filtered heavy | ✅ Full | ✅ All commands load |
| **Event System** | ✅ | ✅ | ✅ | ✅ Canonical contracts |
| **Services** | ✅ 28 services | ✅ 28 services | ✅ 28 services + Pi pragmas | ✅ 28 services |
| **Database** | ✅ SQLite WAL | ✅ SQLite WAL | ✅ SQLite WAL + Pi pragmas | ✅ SQLite WAL + configurable |
| **UI System** | ✅ Components V2 | ✅ Components V2 | ✅ Components V2 | ✅ Components V2 |
| **Entry Point** | bootstrap.js | index.js → bootstrap.js | bootstrap.js | bootstrap.js |

## Feature Inventory

### Moderation
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Warn | ✅ | main | Creates case, DMs user |
| Ban | ✅ | main | With message deletion days |
| Kick | ✅ | main | With reason |
| Timeout | ✅ | main | Duration parsing, auto-expiry |
| Unwarn | ✅ | main | Resolves case |
| Untimeout | ✅ | main | Removes timeout |
| Unban | ✅ | main | |
| Mute/Unmute | ✅ | main | Role-based (legacy) |
| Softban | ✅ | main | Ban + immediate unban |
| Cases | ✅ | main | Sequential numbering per guild |
| Case Notes | ✅ | main | Per-case annotations |
| Case History | ✅ | main | Per-user and per-moderator |
| Mod Center | ✅ | main | Interactive case browser |
| Mod Stats | ✅ | main | Per-moderator stats |
| Auto-escalation | ✅ | main | Threshold-based |
| Raid Protection | ✅ | main | Separate service |
| Fortress | ✅ | main | Server lockdown |

### Tickets
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Ticket Types | ✅ | main | Per-type config (category, staff, prefix, questions) |
| Panel Deployment | ✅ | main | Dropdown-based creation |
| Claim/Unclaim | ✅ | main | Staff only |
| Status/Priority | ✅ | main | Dropdown controls |
| Add/Remove Users | ✅ | main | User select menus |
| Transcripts | ✅ | main | HTML + text |
| Auto-close | ✅ | main | Configurable delay |
| Auto-delete | ✅ | main | Post-archive cleanup |

### AutoMod
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Spam Detection | ✅ | main | Rate + content similarity |
| Caps Detection | ✅ | main | Threshold-based |
| Links Detection | ✅ | main | URL regex |
| Invites Detection | ✅ | main | discord.gg/ regex |
| Mentions Detection | ✅ | main | Count threshold |
| Emoji Spam | ✅ | main | Count threshold |
| Words Filter | ✅ | main | Custom word list |
| Regex Filter | ✅ | main | Custom patterns |
| Duplicate Detection | ✅ | main | Exact match |
| Raid Detection | ✅ | main | Join spike |
| Exemptions | ✅ | main | Roles, channels, users |
| Escalation | ✅ | main | Auto-warn/timeout/kick/ban |

### Leveling & Economy
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| XP Gain | ✅ | main | Per-message, anti-farm |
| Levels | ✅ | main | Quadratic formula |
| Role Rewards | ✅ | main | Per-level role grants |
| Streaks | ✅ | main | Daily XP bonus |
| Prestige | ✅ | main | Reset at level 50 |
| Leaderboards | ✅ | main | Global, weekly, monthly |
| Balance | ✅ | main | Per-guild |
| Daily/Weekly | ✅ | main | Configurable amounts |
| Shop | ✅ | main | Role items, stock |
| Trading | ✅ | main | User-to-user |
| Inventory | ✅ | main | Purchased items |
| Transactions | ✅ | main | Audit trail |

### Tickets (Orders)
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Order Creation | ✅ | main | Category + brief modal |
| Status Pipeline | ✅ | main | Brief→Claimed→In Progress→Review→Revision→Delivered→Paid→Closed |
| Designer Claim | ✅ | main | Staff only |
| Add/Remove Users | ✅ | main | |
| Transcripts | ✅ | main | HTML + text |

### Configuration
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Module Toggle | ✅ | main | 13 modules |
| Log Channels | ✅ | main | Mod log, general, welcome, goodbye |
| Staff Roles | ✅ | main | Staff + moderator + ignored |
| Prefix | ✅ | main | Per-guild |
| Branding | ✅ | main | Name, avatar, banner, nickname |
| AutoMod Config | ✅ | main | Rules, thresholds, exemptions |

### Starboard
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Reaction Threshold | ✅ | main | Configurable |
| Custom Emoji | ✅ | main | |
| Channel Config | ✅ | main | |

### Welcome/Goodbye
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Welcome Channel | ✅ | main | Embed + verification button |
| Goodbye Channel | ✅ | main | Embed |
| Auto-roles | ✅ | main | From config |

### Reaction Roles
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Button Mode | ✅ | main | ≤5 roles |
| Select Menu | ✅ | main | >5 roles |
| Panel Creation | ✅ | main | |

### Giveaways
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Creation | ✅ | main | Prize, winners, duration |
| Auto-end | ✅ | main | Background tick |
| Reroll | ✅ | main | |
| Entries | ✅ | main | Reaction-based |

### Suggestions
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Submission | ✅ | main | Modal |
| Approve/Deny | ✅ | main | Staff buttons |
| Upvote | ✅ | main | Button |

### AFK
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Set AFK | ✅ | main | With reason |
| Auto-remove | ✅ | main | On message |

### Analytics & Diagnostics
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Server Stats | ✅ | main | Members, channels, roles |
| Diagnostics | ✅ | main | Health checks |
| Intelligence | ✅ | main | ML-based (placeholder) |

### Utilities
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| Polls | ✅ | main | Up to 10 options |
| Reminders | ✅ | main | Per-user, persistent |
| Slowmode | ✅ | main | Channel setting |
| Purge | ✅ | main | Bulk delete |
| User Info | ✅ | main | whois, profile, avatar |
| Server Info | ✅ | main | serverinfo, serverstats |

### Fun
| Feature | Status | Source | Notes |
|---------|--------|--------|-------|
| 8ball | ✅ | main | |
| Coinflip | ✅ | main | |
| Hug | ✅ | main | |
| Joke | ✅ | main | API-based |
| Meme | ✅ | main | API-based |
| Roll | ✅ | main | Dice notation |
| RPS | ✅ | main | |
| Ship | ✅ | main | |
| Trivia | ✅ | main | |

## Duplicates & Consolidation Opportunities

| Duplicate Area | Current Files | Recommended |
|----------------|---------------|-------------|
| Economy balance | `bal.js`, `balance.js` | Merge into one |
| XP commands | `xp.js`, `level.js`, `levels.js`, `rank.js`, `xpstats.js` | Consolidate |
| Case commands | `case.js`, `cases.js`, `warnings.js`, `casenote.js`, `modhistory.js` | Consolidate under moderation |
| Level rewards | `levelrewards.js` | Merge into leveling config |
| Moderation | `ban.js`, `kick.js`, `timeout.js`, `warn.js`, `mute.js`, `unmute.js`, `softban.js`, `unban.js`, `untimeout.js`, `unwarn.js` | Already consolidated in `moderation.js` subcommand |
| Ticket commands | `tickets.js`, `ticket.js` | Consolidate |

## Branch-Specific Removals

| Feature | Branch | Action |
|---------|--------|--------|
| `getBranch()` | cherub | Remove - runtime branch detection |
| `isHeavyCommand()` | cherub | Remove - all commands load |
| `index.js` entry | cherub | Remove - use bootstrap.js |
| `--max-old-space-size` | cherub | Move to deployment config |
| Pi pragmas | seraph | Make configurable |
| `setup-pi.sh` | seraph | Move to deployment docs |
| `README_PI.md` | seraph | Move to deployment docs |
| `README_CHERUB.md` | cherub | Archive |

## Migration Priority

1. **High** - Core architecture (bootstrap, client, registry, services)
2. **High** - Command consolidation (moderation, economy, leveling, tickets)
3. **High** - Event system canonical contracts
4. **High** - Service layer ownership
5. **Medium** - Database schema optimization
6. **Medium** - UI/Components V2 consistency
7. **Medium** - Error handling (remove silent catches)
8. **Low** - Documentation rewrite