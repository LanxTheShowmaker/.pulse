import { logger } from "../core/logger.js";

export class EconomyService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
        this._daily = new Map(); // guildId:userId -> timestamp
        this._weekly = new Map();
    }

    async getBalance(guildId, userId) {
        const eco = await this.prisma.economy.findUnique({ where: { guildId_userId: { guildId, userId } } });
        return eco?.balance ?? 0;
    }

    async add(guildId, userId, amount, type, meta) {
        const eco = await this.prisma.economy.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, balance: amount },
            update: { balance: { increment: amount } },
        });

        await this.prisma.economyTransaction.create({
            data: { guildId, userId, type, amount, balanceAfter: eco.balance, meta: meta ? JSON.stringify(meta) : null },
        });

        return eco.balance;
    }

    async claimDaily(guildId, userId, amount = 100) {
        const key = `${guildId}:${userId}`;
        const now = Date.now();
        if (this._daily.has(key) && now - this._daily.get(key) < 86_400_000) {
            const remaining = 86_400_000 - (now - this._daily.get(key));
            return { ok: false, remaining };
        }
        this._daily.set(key, now);
        const balance = await this.add(guildId, userId, amount, "daily");
        return { ok: true, amount, balance };
    }

    async claimWeekly(guildId, userId, amount = 500) {
        const key = `${guildId}:${userId}`;
        const now = Date.now();
        if (this._weekly.has(key) && now - this._weekly.get(key) < 604_800_000) {
            const remaining = 604_800_000 - (now - this._weekly.get(key));
            return { ok: false, remaining };
        }
        this._weekly.set(key, now);
        const balance = await this.add(guildId, userId, amount, "weekly");
        return { ok: true, amount, balance };
    }

    async gift(guildId, fromId, toId, amount) {
        const bal = await this.getBalance(guildId, fromId);
        if (bal < amount) return { ok: false, error: "Insufficient balance" };
        await this.add(guildId, fromId, -amount, "gift_out", { to: toId });
        await this.add(guildId, toId, amount, "gift_in", { from: fromId });
        return { ok: true };
    }

    async getLeaderboard(guildId, limit = 10) {
        return this.prisma.economy.findMany({
            where: { guildId },
            orderBy: { balance: "desc" },
            take: limit,
        });
    }

    async getHistory(guildId, userId, limit = 10) {
        return this.prisma.economyTransaction.findMany({
            where: { guildId, userId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }
}
