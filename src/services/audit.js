import { logger } from "../core/logger.js";

export class AuditService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async log(guildId, actorId, targetId, action, category, details) {
        return this.prisma.auditLog.create({
            data: { guildId, actorId, targetId, action, category, details: details ? JSON.stringify(details) : null },
        });
    }

    async timeline(guildId, limit = 25) {
        return this.prisma.auditLog.findMany({
            where: { guildId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    async byUser(guildId, userId, limit = 25) {
        return this.prisma.auditLog.findMany({
            where: { guildId, actorId: userId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    async stats(guildId) {
        const total = await this.prisma.auditLog.count({ where: { guildId } });
        const byCategory = await this.prisma.auditLog.groupBy({
            by: ["category"],
            where: { guildId },
            _count: true,
        });
        return { total, byCategory: Object.fromEntries(byCategory.map(r => [r.category, r._count])) };
    }
}
