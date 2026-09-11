import { logger } from "../core/logger.js";

function xpForLevel(level) {
    return Math.floor(100 * Math.pow(1.15, level));
}

export class LevelingService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
        this._cooldown = new Map(); // guildId:userId -> timestamp
    }

    async handleMessage(message) {
        if (message.author.bot || !message.guild) return;
        const key = `${message.guild.id}:${message.author.id}`;
        const now = Date.now();
        if (this._cooldown.has(key) && now - this._cooldown.get(key) < 60_000) return;
        this._cooldown.set(key, now);

        const xpGain = Math.floor(Math.random() * 15) + 5;
        const xp = await this.prisma.xp.upsert({
            where: { guildId_userId: { guildId: message.guild.id, userId: message.author.id } },
            create: { guildId: message.guild.id, userId: message.author.id, xp: xpGain, level: 0 },
            update: { xp: { increment: xpGain } },
        });

        const needed = xpForLevel(xp.level);
        if (xp.xp >= needed) {
            await this.prisma.xp.update({
                where: { guildId_userId: { guildId: message.guild.id, userId: message.author.id } },
                data: { level: { increment: 1 }, xp: xp.xp - needed },
            });

            const config = await this.client.services.settings?.get(message.guild.id);
            if (config?.welcomeChannelId) {
                const ch = message.guild.channels.cache.get(config.welcomeChannelId);
                if (ch?.isTextBased()) {
                    await ch.send({ content: `${message.author} reached level **${xp.level + 1}**!` }).catch(() => {});
                }
            }
        }
    }

    async getRank(guildId, userId) {
        const xp = await this.prisma.xp.findUnique({ where: { guildId_userId: { guildId, userId } } });
        if (!xp) return { level: 0, xp: 0, needed: xpForLevel(0), rank: 0 };

        const rank = await this.prisma.$queryRaw`
            SELECT COUNT(*) as rank FROM "Xp"
            WHERE "guildId" = ${guildId} AND ("level" > ${xp.level} OR ("level" = ${xp.level} AND "xp" > ${xp.xp}))
        `;

        return { level: xp.level, xp: xp.xp, needed: xpForLevel(xp.level), rank: Number(rank[0]?.rank ?? 0) + 1 };
    }

    async getLeaderboard(guildId, limit = 10) {
        return this.prisma.xp.findMany({
            where: { guildId },
            orderBy: [{ level: "desc" }, { xp: "desc" }],
            take: limit,
        });
    }
}
