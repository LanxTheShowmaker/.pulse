# .pulse — Branch Status

> **Pulse Variant 2** is the single, universal implementation. Historical branches are archived.

---

## Branch Overview

| Branch | Status | Purpose | Notes |
|--------|--------|---------|-------|
| `master` | **ARCHIVED** | Full self-hosted production | Merged into universal implementation |
| `cherub` | **ARCHIVED** | Ultra-light / low-resource | Runtime optimizations moved to deployment configs |
| `seraph` | **ARCHIVED** | DIY at home (Pi 5, mini PCs) | Hardware-specific tuning moved to deployment configs |

---

## Historical Context

### `master` (formerly primary)
- Complete feature set with all services enabled
- General-purpose, hardware-agnostic
- Entry: `src/core/bootstrap.js` (now universal)
- **All useful functionality merged into universal .pulse**

### `cherub` (ultra-light)
- Target: 320 MB RAM / 1 GB disk (Pterodactyl, budget hosts)
- Optimizations: `--max-old-space-size=256`, command filtering
- Entry: `index.js` → `bootstrap.js`
- **Runtime optimizations now handled via deployment config, not branch logic**

### `seraph` (DIY at home)
- Target: Raspberry Pi 5 8GB/500GB, mini PCs, NAS
- Optimizations: SQLite PRAGMA tuning (64MB cache, 256MB mmap), heap 4GB
- Docs: `README_PI.md`, `setup-pi.sh`
- **Hardware tuning now in deployment documentation, not branch-specific code**

---

## What Was Removed

### Branch-Dependent Runtime Logic
- `getBranch()` function — removed
- `isHeavyCommand()` filtering — removed (all commands load)
- Branch-specific entry points (`index.js`, `start:lite`, `start:seraph`) — removed
- Conditional service initialization — removed

### Legacy Branding
- `A.N.G.E.L.` / `AngelBot` → `.pulse`
- `WingsClient` → `PulseClient`
- `cherub` / `seraph` runtime references — removed
- "Heavenly" / "Grace" / "Wing" terminology — removed from user-facing copy

### Duplicate Systems
- Multiple command registries → single `loadCommands()`
- Multiple event registries → single `loadEvents()`
- Duplicate service containers → single `createServices()`
- Competing UI implementations → single Components V2 design system

---

## Universal Implementation

The `master` branch now contains **Pulse Variant 2** — one clean implementation with:

- ✅ All useful features from all historical variants
- ✅ Single command system with proper hierarchy
- ✅ Single event system with canonical contracts
- ✅ Single service container with explicit dependencies
- ✅ Single Components V2 design system
- ✅ Single database layer (Prisma + SQLite)
- ✅ Professional documentation
- ✅ No branch-dependent runtime behavior

---

## Deployment Variants (Not Branches)

Deployment differences are now **configuration**, not code:

| Variant | Configuration |
|---------|---------------|
| **Standard** | Default Node.js heap |
| **Low-Resource** | `--max-old-space-size=256` |
| **Home Server (Pi 5)** | `--max-old-space-size=4096`, tuned MySQL server buffers |

See deployment documentation for details.

---

## Migration

If you were on a historical branch:

1. **Pull latest `test`** — contains the universal implementation
2. **Update `.env`** — ensure `DISCORD_TOKEN` and `DATABASE_URL` (MySQL)
3. **Run migrations** — `npm run db:migrate`
4. **Deploy commands** — `npm run deploy`
5. **Start** — `npm run start`

Coming from the old Prisma + SQLite setup? The schema moved to Drizzle ORM on
MySQL, so the tables must be created in MySQL. Copy any existing data across
with `node db/migrate-data.mjs <path-to-legacy.db>`.

---

## Archive Notice

Historical branches (`cherub`, `seraph`) remain in Git for reference but are **no longer maintained**. All development occurs on `master` as the single universal `.pulse` implementation.

**Do not create new variant branches.** Feature work goes directly to `master` with proper architecture.