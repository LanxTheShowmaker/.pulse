import { EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { eq, and, desc, count } from "drizzle-orm";
import { suggestion } from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
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
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async create(guild, channel, author, content) {
        const id = uuid();
        await this.db.insert(suggestion).values(clean({
            id,
            guildId: guild.id,
            channelId: channel.id,
            authorId: author.id,
            content,
        }));
        const row = one(await this.db.select().from(suggestion).where(eq(suggestion.id, id)));

        const embed = new EmbedBuilder()
            .setColor(STATUS_COLOR.PENDING)
            .setTitle(`Suggestion #${row.id.slice(0, 6)}`)
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

        await this.db.update(suggestion).set({ messageId: msg.id }).where(eq(suggestion.id, row.id));
        return { suggestion: row, message: msg };
    }

    async setStatus(guildId, suggestionId, status, reviewerId, note) {
        const row = one(await this.db.select().from(suggestion).where(eq(suggestion.id, suggestionId)).limit(1));
        if (!row) return null;

        await this.db.update(suggestion)
            .set(clean({ status, reviewerId, reviewNote: note || null }))
            .where(eq(suggestion.id, suggestionId));
        const updated = one(await this.db.select().from(suggestion).where(eq(suggestion.id, suggestionId)).limit(1));

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return updated;

        const ch = guild.channels.cache.get(updated.channelId);
        if (!ch?.isTextBased()) return updated;

        const msg = await ch.messages.fetch(updated.messageId).catch(() => null);
        if (!msg) return updated;

        const embed = new EmbedBuilder()
            .setColor(STATUS_COLOR[status] || Theme.accent)
            .setTitle(`Suggestion #${updated.id.slice(0, 6)}`)
            .setDescription(updated.content)
            .addFields(
                { name: "Author", value: `<@${updated.authorId}>`, inline: true },
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
        const conds = [eq(suggestion.guildId, guildId)];
        if (status) conds.push(eq(suggestion.status, status));
        return this.db.select().from(suggestion)
            .where(and(...conds)).orderBy(desc(suggestion.createdAt)).limit(limit);
    }

    async getById(id) {
        return one(await this.db.select().from(suggestion).where(eq(suggestion.id, id)).limit(1));
    }

    async getStats(guildId) {
        const all = await this.db.select({ status: suggestion.status, n: count() }).from(suggestion)
            .where(eq(suggestion.guildId, guildId)).groupBy(suggestion.status);
        const stats = { PENDING: 0, APPROVED: 0, DENIED: 0, IMPLEMENTED: 0, CLOSED: 0 };
        for (const row of all) stats[row.status] = Number(row.n);
        return stats;
    }
}
