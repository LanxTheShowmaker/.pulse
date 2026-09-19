import { eq, and, desc, sql } from "drizzle-orm";
import { levelConfig, xp } from "../db/schema/index.js";
import { selectRows, clean, one } from "../db/util.js";
import { logger } from "../core/logger.js";

function xpForLevel(level) {
    return Math.floor(100 * Math.pow(1.15, level));
}

export class LevelingService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
        this._cooldown = new Map();
        this._msgCount = new Map(); // guildId:userId -> count for anti-farm
    }

    async getLevelConfig(guildId) {
        let cfg = one(await this.db.select().from(levelConfig).where(eq(levelConfig.guildId, guildId)).limit(1));
        if (!cfg) {
            await this.db.insert(levelConfig).values({ guildId });
            cfg = one(await this.db.select().from(levelConfig).where(eq(levelConfig.guildId, guildId)).limit(1));
        }
        return {
            ...cfg,
            channelMultipliers: JSON.parse(cfg.channelMultipliers || "{}"),
            roleRewards: JSON.parse(cfg.roleRewards || "[]"),
        };
    }

    async setLevelConfig(guildId, data) {
        const set = clean(data);
        await this.db.insert(levelConfig).values({ guildId, ...set })
            .onDuplicateKeyUpdate({ set });
        return one(await this.db.select().from(levelConfig).where(eq(levelConfig.guildId, guildId)).limit(1));
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

        await this.db.insert(xp)
            .values({ guildId: message.guild.id, userId: message.author.id, xp: xpGain, level: 0 })
            .onDuplicateKeyUpdate({ set: { xp: sql`${xp.xp} + ${xpGain}` } });
        const row = one(await this.db.select().from(xp)
            .where(and(eq(xp.guildId, message.guild.id), eq(xp.userId, message.author.id))).limit(1));

        const needed = xpForLevel(row.level);
        if (row.xp >= needed) {
            const newLevel = row.level + 1;
            await this.db.update(xp)
                .set({ level: newLevel, xp: row.xp - needed })
                .where(and(eq(xp.guildId, message.guild.id), eq(xp.userId, message.author.id)));

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

            // Achievement: level reached
            message.client.services.achievements?.increment(message.guild.id, message.author.id, "level", newLevel).catch(() => {});
        }
    }

    async getRank(guildId, userId) {
        const row = one(await this.db.select().from(xp)
            .where(and(eq(xp.guildId, guildId), eq(xp.userId, userId))).limit(1));
        if (!row) return { level: 0, xp: 0, needed: xpForLevel(0), rank: 0 };

        const rank = await selectRows(this.db.execute(sql`
            SELECT COUNT(*) as rnk FROM \`Xp\`
            WHERE \`guildId\` = ${guildId} AND (\`level\` > ${row.level} OR (\`level\` = ${row.level} AND \`xp\` > ${row.xp}))
        `));
        const n = rank[0]?.rnk ?? 0;

        return { level: row.level, xp: row.xp, needed: xpForLevel(row.level), rank: Number(n) + 1 };
    }

    async getLeaderboard(guildId, limit = 10) {
        return this.db.select().from(xp)
            .where(eq(xp.guildId, guildId))
            .orderBy(desc(xp.level), desc(xp.xp)).limit(limit);
    }
}
