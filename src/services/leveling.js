import { logger } from "../core/logger.js";

function xpForLevel(level) {
    return Math.floor(100 * Math.pow(1.15, level));
}

export class LevelingService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
        this._cooldown = new Map();
        this._msgCount = new Map(); // guildId:userId -> count for anti-farm
    }

    async getLevelConfig(guildId) {
        let cfg = await this.prisma.levelConfig.findUnique({ where: { guildId } });
        if (!cfg) cfg = await this.prisma.levelConfig.create({ data: { guildId } });
        return {
            ...cfg,
            channelMultipliers: JSON.parse(cfg.channelMultipliers || "{}"),
            roleRewards: JSON.parse(cfg.roleRewards || "[]"),
        };
    }

    async setLevelConfig(guildId, data) {
        return this.prisma.levelConfig.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data,
        });
    }

    async handleMessage(message) {
        if (message.author.bot || !message.guild) return;
        const key = `${message.guild.id}:${message.author.id}`;
        const now = Date.now();
        if (this._cooldown.has(key) && now - this._cooldown.get(key) < 60_000) return;
        this._cooldown.set(key, now);

        // Check ignored lists
        const config = await this.client.services.settings?.get(message.guild.id);
        if (config && this.client.services.settings.isIgnored(config, {
            userId: message.author.id,
            channelId: message.channel.id,
            roleIds: [...message.member.roles.cache.keys()],
        })) return;

        const lvlConfig = await this.getLevelConfig(message.guild.id);

        // Anti-farm: max 3 messages per minute per user
        if (lvlConfig.antiFarmEnabled) {
            const farmKey = `${message.guild.id}:${message.author.id}`;
            const count = (this._msgCount.get(farmKey) ?? 0) + 1;
            this._msgCount.set(farmKey, count);
            if (count > 3) return;
            setTimeout(() => {
                const c = this._msgCount.get(farmKey) ?? 0;
                if (c > 0) this._msgCount.set(farmKey, c - 1);
            }, 60_000);
        }

        // Calculate XP with multipliers
        let xpGain = Math.floor(Math.random() * 15) + 5;
        xpGain = Math.floor(xpGain * (lvlConfig.xpMultiplier || 1));
        const channelMult = lvlConfig.channelMultipliers[message.channel.id];
        if (channelMult) xpGain = Math.floor(xpGain * channelMult);
        xpGain = Math.max(1, xpGain);

        const xp = await this.prisma.xp.upsert({
            where: { guildId_userId: { guildId: message.guild.id, userId: message.author.id } },
            create: { guildId: message.guild.id, userId: message.author.id, xp: xpGain, level: 0 },
            update: { xp: { increment: xpGain } },
        });

        const needed = xpForLevel(xp.level);
        if (xp.xp >= needed) {
            const newLevel = xp.level + 1;
            await this.prisma.xp.update({
                where: { guildId_userId: { guildId: message.guild.id, userId: message.author.id } },
                data: { level: newLevel, xp: xp.xp - needed },
            });

            // Announce level-up
            const chId = lvlConfig.announceChannelId || config?.welcomeChannelId;
            const ch = message.guild.channels.cache.get(chId);
            if (ch?.isTextBased()) {
                await ch.send({ content: `${message.author} reached level **${newLevel}**!` }).catch(() => {});
            }

            // Award role rewards
            for (const reward of lvlConfig.roleRewards) {
                if (newLevel >= reward.level) {
                    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
                    if (member && !member.roles.cache.has(reward.roleId)) {
                        await member.roles.add(reward.roleId).catch(() => {});
                    }
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
