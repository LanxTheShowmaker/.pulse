export class CasesService {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async create(guildId, data) {
        const last = await this.prisma.case.findFirst({
            where: { guildId },
            orderBy: { caseNumber: "desc" },
            select: { caseNumber: true },
        });
        const caseNumber = (last?.caseNumber ?? 0) + 1;

        return this.prisma.case.create({
            data: {
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
            },
        });
    }

    async get(guildId, caseNumber) {
        return this.prisma.case.findUnique({
            where: { guildId_caseNumber: { guildId, caseNumber } },
        });
    }

    async edit(guildId, caseNumber, reason) {
        return this.prisma.case.update({
            where: { guildId_caseNumber: { guildId, caseNumber } },
            data: { reason },
        });
    }

    async resolve(guildId, caseNumber, resolverId, resolverTag) {
        return this.prisma.case.update({
            where: { guildId_caseNumber: { guildId, caseNumber } },
            data: { resolved: true, resolvedById: resolverId, resolvedByTag: resolverTag, resolvedAt: new Date() },
        });
    }

    async byTarget(guildId, targetId, limit = 25) {
        return this.prisma.case.findMany({
            where: { guildId, targetId },
            orderBy: { caseNumber: "desc" },
            take: limit,
        });
    }

    async recent(guildId, limit = 25) {
        return this.prisma.case.findMany({
            where: { guildId },
            orderBy: { caseNumber: "desc" },
            take: limit,
        });
    }

    async count(guildId, action, sinceMs) {
        const where = { guildId };
        if (action) where.action = action;
        if (sinceMs) where.createdAt = { gte: new Date(Date.now() - sinceMs) };
        return this.prisma.case.count({ where });
    }

    async infractionCount(guildId, targetId) {
        return this.prisma.case.count({
            where: { guildId, targetId, action: { in: ["warn", "ban", "kick", "timeout"] } },
        });
    }

    async addNote(guildId, targetId, authorId, authorTag, content) {
        return this.prisma.caseNote.create({
            data: { guildId, targetId, authorId, authorTag, content },
        });
    }

    async getNotes(guildId, targetId, limit = 25) {
        return this.prisma.caseNote.findMany({
            where: { guildId, targetId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    async stats(guildId) {
        const total = await this.prisma.case.count({ where: { guildId } });
        const byAction = await this.prisma.case.groupBy({
            by: ["action"],
            where: { guildId },
            _count: true,
        });
        return { total, byAction: Object.fromEntries(byAction.map(r => [r.action, r._count])) };
    }
}
