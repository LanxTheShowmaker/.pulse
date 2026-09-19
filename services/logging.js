import { ChannelType } from "discord.js";
import { eq, desc } from "drizzle-orm";
import { guildConfig, auditLog } from "../db/schema/index.js";
import { one } from "../db/util.js";
import { logger } from "../core/logger.js";

export class LoggingService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async channel(guildId, type) {
        const config = one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
        if (!config) return null;
        const id = type === "mod" ? config.modLogChannelId : config.logChannelId;
        if (!id) return null;
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;
        return guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    }

    async logMessage(guildId, embed) {
        const ch = await this.channel(guildId, "log");
        if (ch?.isTextBased()) await ch.send({ embeds: [embed] }).catch(e => logger.warn("logging", "message log failed", e.message));
    }

    async logMod(guildId, embed) {
        const ch = await this.channel(guildId, "mod");
        if (ch?.isTextBased()) await ch.send({ embeds: [embed] }).catch(e => logger.warn("logging", "mod log failed", e.message));
    }

    async getModLogHistory(guildId, limit = 50) {
        // Return audit log entries for moderation
        return this.db.select({
            id: auditLog.id,
            actorId: auditLog.actorId,
            targetId: auditLog.targetId,
            action: auditLog.action,
            category: auditLog.category,
            details: auditLog.details,
            createdAt: auditLog.createdAt,
        }).from(auditLog).where(eq(auditLog.guildId, guildId))
            .orderBy(desc(auditLog.createdAt)).limit(limit);
    }
}
