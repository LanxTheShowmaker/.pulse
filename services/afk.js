import { eq, and } from "drizzle-orm";
import { afk } from "../db/schema/index.js";
import { one } from "../db/util.js";
import { logger } from "../core/logger.js";

export class AfkService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async set(guildId, userId, reason) {
        await this.db.insert(afk).values({ guildId, userId, reason })
            .onDuplicateKeyUpdate({ set: { reason, since: new Date() } });
        return one(await this.db.select().from(afk)
            .where(and(eq(afk.guildId, guildId), eq(afk.userId, userId))).limit(1));
    }

    async remove(guildId, userId) {
        const row = one(await this.db.select().from(afk)
            .where(and(eq(afk.guildId, guildId), eq(afk.userId, userId))).limit(1));
        if (row) {
            await this.db.delete(afk).where(and(eq(afk.guildId, guildId), eq(afk.userId, userId)));
            return row;
        }
        return null;
    }

    async get(guildId, userId) {
        return one(await this.db.select().from(afk)
            .where(and(eq(afk.guildId, guildId), eq(afk.userId, userId))).limit(1));
    }

    async handleMessage(message) {
        if (message.author.bot || !message.guild) return;

        // Check if the mentioned user is AFK
        for (const [id, user] of message.mentions.users) {
            const row = await this.get(message.guild.id, id);
            if (row) {
                const time = Math.floor((Date.now() - row.since.getTime()) / 60_000);
                await message.reply(`${user.tag} is AFK${row.reason ? `: ${row.reason}` : ""} (${time}m ago)`).catch(() => {});
            }
        }

        // Remove AFK if the sender is AFK
        const senderAfk = await this.get(message.guild.id, message.author.id);
        if (senderAfk) {
            await this.remove(message.guild.id, message.author.id);
            await message.reply(`Welcome back! Removed your AFK.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5_000)).catch(() => {});
        }
    }
}
