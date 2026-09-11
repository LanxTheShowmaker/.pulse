import { PrismaClient } from "@prisma/client";
import { CasesService } from "../services/cases.js";
import { LoggingService } from "../services/logging.js";
import { ModerationService } from "../services/moderation.js";
import { logger } from "./logger.js";

export function createServices(client) {
    const prisma = new PrismaClient();

    const cases = new CasesService(prisma);
    const logging = new LoggingService(prisma, client);
    const moderation = new ModerationService(prisma, cases, logging, client);

    client.prisma = prisma;
    return { prisma, cases, logging, moderation };
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
