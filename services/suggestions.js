import { EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

const STATUS = {
    PENDING: "⏳ Pending",
    APPROVED: "✅ Approved",
    DENIED: "❌ Denied",
    IMPLEMENTED: "🔧 Implemented",
    CLOSED: "📦 Closed",
};

const STATUS_COLOR = {
    PENDING: Theme.accent,
    APPROVED: Theme.success,
    DENIED: Theme.danger,
    IMPLEMENTED: Theme.gold,
    CLOSED: Theme.muted,
};

export class SuggestionService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async create(guild, channel, author, content) {
        const suggestion = await this.prisma.suggestion.create({
            data: {
                guildId: guild.id,
                channelId: channel.id,
                authorId: author.id,
                content,
            },
        });

        const embed = new EmbedBuilder()
            .setColor(STATUS_COLOR.PENDING)
            .setTitle(`Suggestion #${suggestion.id.slice(0, 6)}`)
            .setDescription(content)
            .addFields(
                { name: "Author", value: `<@${author.id}>`, inline: true },
                { name: "Status", value: STATUS.PENDING, inline: true },
            )
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        await msg.react("✅").catch(() => {});
        await msg.react("❌").catch(() => {});

        await this.prisma.suggestion.update({ where: { id: suggestion.id }, data: { messageId: msg.id } });
        return { suggestion, message: msg };
    }

    async setStatus(guildId, suggestionId, status, reviewerId, note) {
        const suggestion = await this.prisma.suggestion.findUnique({ where: { id: suggestionId } });
        if (!suggestion) return null;

        const updated = await this.prisma.suggestion.update({
            where: { id: suggestionId },
            data: { status, reviewerId, reviewNote: note || null },
        });

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return updated;

        const ch = guild.channels.cache.get(suggestion.channelId);
        if (!ch?.isTextBased()) return updated;

        const msg = await ch.messages.fetch(suggestion.messageId).catch(() => null);
        if (!msg) return updated;

        const embed = new EmbedBuilder()
            .setColor(STATUS_COLOR[status] || Theme.accent)
            .setTitle(`Suggestion #${suggestion.id.slice(0, 6)}`)
            .setDescription(suggestion.content)
            .addFields(
                { name: "Author", value: `<@${suggestion.authorId}>`, inline: true },
                { name: "Status", value: STATUS[status] || status, inline: true },
            )
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        if (note) {
            embed.addFields({ name: "Review Note", value: note });
        }
        if (reviewerId) {
            embed.addFields({ name: "Reviewed by", value: `<@${reviewerId}>`, inline: true });
        }

        await msg.edit({ embeds: [embed] }).catch(() => {});
        return updated;
    }

    async getByGuild(guildId, status, limit = 25) {
        const where = { guildId };
        if (status) where.status = status;
        return this.prisma.suggestion.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
    }

    async getById(id) {
        return this.prisma.suggestion.findUnique({ where: { id } });
    }

    async getStats(guildId) {
        const all = await this.prisma.suggestion.groupBy({
            by: ["status"],
            where: { guildId },
            _count: true,
        });
        const stats = { PENDING: 0, APPROVED: 0, DENIED: 0, IMPLEMENTED: 0, CLOSED: 0 };
        for (const row of all) stats[row.status] = row._count;
        return stats;
    }
}
