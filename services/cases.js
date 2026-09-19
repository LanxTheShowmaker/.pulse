import { eq, and, desc, count, gte, inArray } from "drizzle-orm";
import { case_ as caseTable, caseNote } from "../db/schema/index.js";
import { clean, one } from "../db/util.js";

export class CasesService {
    constructor(db) {
        this.db = db;
    }

    async create(guildId, data) {
        const last = one(await this.db.select({ caseNumber: caseTable.caseNumber }).from(caseTable)
            .where(eq(caseTable.guildId, guildId)).orderBy(desc(caseTable.caseNumber)).limit(1));
        const caseNumber = (last?.caseNumber ?? 0) + 1;

        // NOTE: Case.id is an auto-increment integer — never supply it.
        await this.db.insert(caseTable).values(clean({
            guildId,
            caseNumber,
            targetId: data.targetId,
            targetTag: data.targetTag,
            moderatorId: data.moderatorId,
            moderatorTag: data.moderatorTag,
            action: data.action,
            reason: data.reason ?? null,
            duration: data.duration ?? null,
            durationMs: data.durationMs ?? null,
            metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        }));
        return one(await this.db.select().from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber))).limit(1));
    }

    async get(guildId, caseNumber) {
        return one(await this.db.select().from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber))).limit(1));
    }

    async edit(guildId, caseNumber, reason) {
        await this.db.update(caseTable).set({ reason })
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber)));
        return this.get(guildId, caseNumber);
    }

    async resolve(guildId, caseNumber, resolverId, resolverTag) {
        await this.db.update(caseTable)
            .set({ resolved: true, resolvedById: resolverId, resolvedByTag: resolverTag, resolvedAt: new Date() })
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber)));
        return this.get(guildId, caseNumber);
    }

    async byTarget(guildId, targetId, limit = 25) {
        return this.db.select().from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.targetId, targetId)))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async recent(guildId, limit = 25) {
        return this.db.select().from(caseTable)
            .where(eq(caseTable.guildId, guildId))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async count(guildId, action, sinceMs) {
        const conds = [eq(caseTable.guildId, guildId)];
        if (action) conds.push(eq(caseTable.action, action));
        if (sinceMs) conds.push(gte(caseTable.createdAt, new Date(Date.now() - sinceMs)));
        const rows = await this.db.select({ n: count() }).from(caseTable).where(and(...conds));
        return Number(rows[0]?.n ?? 0);
    }

    async infractionCount(guildId, targetId) {
        const rows = await this.db.select({ n: count() }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.targetId, targetId), inArray(caseTable.action, ["warn", "ban", "kick", "timeout"])));
        return Number(rows[0]?.n ?? 0);
    }

    async addNote(guildId, targetId, authorId, authorTag, content) {
        const id = uuid();
        await this.db.insert(caseNote).values({ id, guildId, targetId, authorId, authorTag, content });
        return one(await this.db.select().from(caseNote).where(eq(caseNote.id, id)));
    }

    async getNotes(guildId, targetId, limit = 25) {
        return this.db.select().from(caseNote)
            .where(and(eq(caseNote.guildId, guildId), eq(caseNote.targetId, targetId)))
            .orderBy(desc(caseNote.createdAt)).limit(limit);
    }

    async stats(guildId) {
        const totalRows = await this.db.select({ n: count() }).from(caseTable).where(eq(caseTable.guildId, guildId));
        const byAction = await this.db.select({ action: caseTable.action, n: count() }).from(caseTable)
            .where(eq(caseTable.guildId, guildId)).groupBy(caseTable.action);
        return {
            total: Number(totalRows[0]?.n ?? 0),
            byAction: Object.fromEntries(byAction.map(r => [r.action, Number(r.n)])),
        };
    }

    // ─── API BOUNDARY: Cases API ────────────────────────────

    async getRecentCasesApi(guildId, limit = 25) {
        return this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            resolvedById: caseTable.resolvedById,
            resolvedByTag: caseTable.resolvedByTag,
            resolvedAt: caseTable.resolvedAt,
            createdAt: caseTable.createdAt,
        }).from(caseTable).where(eq(caseTable.guildId, guildId))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async getCaseApi(guildId, caseNumber) {
        return one(await this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            moderatorId: caseTable.moderatorId,
            moderatorTag: caseTable.moderatorTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            resolvedById: caseTable.resolvedById,
            resolvedByTag: caseTable.resolvedByTag,
            resolvedAt: caseTable.resolvedAt,
            metadata: caseTable.metadata,
            createdAt: caseTable.createdAt,
        }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber))).limit(1));
    }

    async getCasesByTargetApi(guildId, targetId, limit = 25) {
        return this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            createdAt: caseTable.createdAt,
        }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.targetId, targetId)))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async getCaseStatsApi(guildId) {
        const totalRows = await this.db.select({ n: count() }).from(caseTable).where(eq(caseTable.guildId, guildId));
        const byAction = await this.db.select({ action: caseTable.action, n: count() }).from(caseTable)
            .where(eq(caseTable.guildId, guildId)).groupBy(caseTable.action);
        return {
            total: Number(totalRows[0]?.n ?? 0),
            byAction: Object.fromEntries(byAction.map(r => [r.action, Number(r.n)])),
        };
    }
}
