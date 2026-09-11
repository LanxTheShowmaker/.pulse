import { PrismaClient } from "@prisma/client";
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
import { logger } from "./logger.js";

export function createServices(client) {
    const prisma = new PrismaClient();

    const settings = new SettingsService(prisma, client);
    const cases = new CasesService(prisma);
    const logging = new LoggingService(prisma, client);
    const moderation = new ModerationService(prisma, cases, logging, client);
    const automod = new AutoModService(prisma, client, settings, logging);
    const leveling = new LevelingService(prisma, client);
    const economy = new EconomyService(prisma, client);
    const giveaways = new GiveawayService(prisma, client);
    const tickets = new TicketService(prisma, client, settings, logging);
    const shop = new ShopService(prisma, client, economy);
    const suggestions = new SuggestionService(prisma, client);
    const starboard = new StarboardService(prisma, client);
    const afk = new AfkService(prisma, client);
    const audit = new AuditService(prisma, client);
    const reactionRoles = new ReactionRoleService(prisma, client);
    const branding = new BrandingService(prisma, client);
    const diagnostics = new DiagnosticsService(prisma, client);

    client.prisma = prisma;
    return { prisma, settings, cases, logging, moderation, automod, leveling, economy, giveaways, tickets, shop, suggestions, starboard, afk, audit, reactionRoles, branding, diagnostics };
}

export async function shutdownServices(services) {
    for (const svc of Object.values(services)) {
        if (svc && typeof svc.shutdown === "function") {
            await svc.shutdown().catch(() => {});
        }
    }
}

export async function initDatabase(prisma) {
    await prisma.$connect();

    const pragmas = [
        { sql: "PRAGMA journal_mode=WAL", name: "journal_mode" },
        { sql: "PRAGMA busy_timeout=5000", name: "busy_timeout" },
        { sql: "PRAGMA synchronous=NORMAL", name: "synchronous" },
    ];

    for (const { sql, name } of pragmas) {
        try {
            const result = await prisma.$queryRawUnsafe(sql);
            logger.info("db", `${name} = ${result[0]?.[name]}`);
        } catch (e) {
            logger.error("db", `${sql} failed`, e.message);
            throw e;
        }
    }

    // Data migration: convert legacy ended=1 giveaways to status='ENDED'
    try {
        const cols = await prisma.$queryRaw`PRAGMA table_info("Giveaway")`;
        if (cols.some(c => c.name === "status")) {
            const n = await prisma.$executeRaw`UPDATE "Giveaway" SET "status" = 'ENDED' WHERE "ended" = 1 AND "status" != 'ENDED'`;
            if (n > 0) logger.info("db", `migrated ${n} ended giveaway(s)`);
        }
    } catch {}
}
