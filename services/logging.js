import { ChannelType } from "discord.js";
import { logger } from "../core/logger.js";

export class LoggingService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async channel(guildId, type) {
        const config = await this.prisma.guildConfig.findUnique({ where: { guildId } });
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
        return this.prisma.auditLog.findMany({
            where: { guildId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, actorId: true, targetId: true, action: true, category: true, details: true, createdAt: true },
        });
    }
}
