import { eq, and, desc, count } from "drizzle-orm";
import { auditLog } from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
import { logger } from "../core/logger.js";

export class AuditService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async log(guildId, actorId, targetId, action, category, details) {
        const id = uuid();
        await this.db.insert(auditLog).values(clean({
            id, guildId, actorId, targetId, action, category,
            details: details ? JSON.stringify(details) : null,
        }));
        return one(await this.db.select().from(auditLog).where(eq(auditLog.id, id)));
    }

    async timeline(guildId, limit = 25) {
        return this.db.select().from(auditLog)
            .where(eq(auditLog.guildId, guildId))
            .orderBy(desc(auditLog.createdAt)).limit(limit);
    }

    async byUser(guildId, userId, limit = 25) {
        return this.db.select().from(auditLog)
            .where(and(eq(auditLog.guildId, guildId), eq(auditLog.actorId, userId)))
            .orderBy(desc(auditLog.createdAt)).limit(limit);
    }

    async stats(guildId) {
        const totalRows = await this.db.select({ n: count() }).from(auditLog).where(eq(auditLog.guildId, guildId));
        const byCategory = await this.db.select({ category: auditLog.category, n: count() }).from(auditLog)
            .where(eq(auditLog.guildId, guildId)).groupBy(auditLog.category);
        return {
            total: Number(totalRows[0]?.n ?? 0),
            byCategory: Object.fromEntries(byCategory.map(r => [r.category, Number(r.n)])),
        };
    }
}
