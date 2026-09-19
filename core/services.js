import { eq, and, ne, lte } from "drizzle-orm";
import { getDb, verifyDatabase, closeDatabase } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { reminder, giveaway } from "../db/schema/index.js";
import { affected } from "../db/util.js";
import { SettingsService } from "../services/settings.js";
import { CasesService } from "../services/cases.js";
import { LoggingService } from "../services/logging.js";
import { ModerationService } from "../services/moderation.js";
import { AutoModService } from "../services/automod.js";
import { LevelingService } from "../services/leveling.js";
import { EconomyService } from "../services/economy.js";
import { GiveawayService } from "../services/giveaways.js";
import { TicketService } from "../services/tickets.js";
import { ShopService } from "../services/shop.js";
import { SuggestionService } from "../services/suggestions.js";
import { StarboardService } from "../services/starboard.js";
import { AfkService } from "../services/afk.js";
import { AuditService } from "../services/audit.js";
import { ReactionRoleService } from "../services/reactionRoles.js";
import { BrandingService } from "../services/branding.js";
import { DiagnosticsService } from "../services/diagnostics.js";
import { AchievementService } from "../services/achievements.js";
import { AppealService } from "../services/appeals.js";
import { PanelService } from "../services/panels.js";
import { BackupService } from "../services/backups.js";
import { TriageEngine } from "../services/triage.js";
import { logger } from "./logger.js";

export function createServices(client) {
    const db = getDb();

    const settings = new SettingsService(db, client);
    const cases = new CasesService(db);
    const logging = new LoggingService(db, client);
    const audit = new AuditService(db, client);
    const moderation = new ModerationService(db, cases, logging, audit, client);
    const automod = new AutoModService(db, client, settings, logging);
    const leveling = new LevelingService(db, client);
    const economy = new EconomyService(db, client);
    const giveaways = new GiveawayService(db, client);
    const tickets = new TicketService(db, client, settings, logging);
    const shop = new ShopService(db, client, economy);
    const suggestions = new SuggestionService(db, client);
    const starboard = new StarboardService(db, client);
    const afk = new AfkService(db, client);
    const reactionRoles = new ReactionRoleService(db, client);
    const branding = new BrandingService(db, client);
    const diagnostics = new DiagnosticsService(db, client);
    const achievements = new AchievementService(db, client);
    const appeals = new AppealService(db, client, logging);
    const panelService = new PanelService(db, client);
    const backups = new BackupService(db, client, settings);
    const triage = new TriageEngine();

    return { db, settings, cases, logging, moderation, automod, leveling, economy, giveaways, tickets, shop, suggestions, starboard, afk, audit, reactionRoles, branding, diagnostics, achievements, appeals, panelService, backups, triage };
}

export function getDbHandle() {
    return getDb();
}

export async function shutdownServices(services) {
    for (const svc of Object.values(services)) {
        if (svc && typeof svc.shutdown === "function") {
            await svc.shutdown().catch(() => {});
        }
    }
}

export async function initDatabase() {
    const db = getDb();
    await verifyDatabase();
    logger.info("db", "MySQL connected.");
    await runMigrations();

    // Data fix: legacy ended=1 giveaways to status='ENDED'
    try {
        const res = await db.update(giveaway)
            .set({ status: "ENDED" })
            .where(and(eq(giveaway.ended, true), ne(giveaway.status, "ENDED")));
        const n = affected(res);
        if (n > 0) logger.info("db", `migrated ${n} ended giveaway(s)`);
    } catch (e) {
        logger.error("db", "giveaway status migration failed", e?.message);
    }

    // Reminder checker — polls every 30s for due reminders
    setInterval(async () => {
        try {
            const due = await db.select().from(reminder)
                .where(lte(reminder.remindAt, new Date())).limit(10);
            for (const r of due) {
                try {
                    const guild = globalThis._client?.guilds?.cache?.get(r.guildId);
                    const ch = guild?.channels?.cache?.get(r.channelId);
                    if (ch?.isTextBased()) {
                        await ch.send({ content: `<@${r.userId}> Reminder: ${r.message}` }).catch(() => {});
                    }
                } catch {}
                await db.delete(reminder).where(eq(reminder.id, r.id)).catch(() => {});
            }
        } catch {}
    }, 30_000);
}

export { closeDatabase };
