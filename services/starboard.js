import { EmbedBuilder } from "@discordjs/builders";
import { eq, and } from "drizzle-orm";
import { starboardConfig, starboardEntry } from "../db/schema/index.js";
import { one } from "../db/util.js";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class StarboardService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async getConfig(guildId) {
        return one(await this.db.select().from(starboardConfig).where(eq(starboardConfig.guildId, guildId)).limit(1));
    }

    async findEntry(guildId, originalId) {
        return one(await this.db.select().from(starboardEntry)
            .where(and(eq(starboardEntry.guildId, guildId), eq(starboardEntry.originalId, originalId))).limit(1));
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const config = await this.getConfig(reaction.message.guild.id);
        if (!config) return;
        if (reaction.emoji.name !== config.emoji) return;

        const message = reaction.message;
        const stars = reaction.count ?? 0;
        if (stars < config.threshold) return;

        const ch = message.guild.channels.cache.get(config.channelId);
        if (!ch?.isTextBased()) return;

        const existing = await this.findEntry(message.guild.id, message.id);

        if (existing) {
            // Update existing starboard post
            const starMsg = await ch.messages.fetch(existing.starboardId).catch(() => null);
            if (starMsg) {
                const embed = this.buildEmbed(message, stars);
                await starMsg.edit({ embeds: [embed] }).catch(() => {});
            }
            await this.db.update(starboardEntry).set({ starCount: stars }).where(eq(starboardEntry.id, existing.id)).catch(() => {});
            return;
        }

        // Create new starboard post
        const embed = this.buildEmbed(message, stars);
        const sent = await ch.send({ embeds: [embed] }).catch(e => {
            logger.warn("starboard", "send failed", e.message);
            return null;
        });
        if (!sent) return;

        await this.db.insert(starboardEntry).values({
            guildId: message.guild.id,
            originalId: message.id,
            starboardId: sent.id,
            starCount: stars,
        });
    }

    async handleReactionRemove(reaction, user) {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const config = await this.getConfig(reaction.message.guild.id);
        if (!config) return;
        if (reaction.emoji.name !== config.emoji) return;

        const message = reaction.message;

        const entry = await this.findEntry(message.guild.id, message.id);
        if (!entry) return;

        const newCount = reaction.count ?? 0;

        if (newCount < config.threshold) {
            // Below threshold — delete starboard post
            const ch = message.guild.channels.cache.get(config.channelId);
            if (ch) {
                await ch.messages.delete(entry.starboardId).catch(() => {});
            }
            await this.db.delete(starboardEntry).where(eq(starboardEntry.id, entry.id)).catch(() => {});
            return;
        }

        // Update count
        const ch = message.guild.channels.cache.get(config.channelId);
        if (ch) {
            const starMsg = await ch.messages.fetch(entry.starboardId).catch(() => null);
            if (starMsg) {
                const embed = this.buildEmbed(message, newCount);
                await starMsg.edit({ embeds: [embed] }).catch(() => {});
            }
        }
        await this.db.update(starboardEntry).set({ starCount: newCount }).where(eq(starboardEntry.id, entry.id)).catch(() => {});
    }

    buildEmbed(message, stars) {
        const author = message.author;
        const embed = new EmbedBuilder()
            .setColor(Theme.gold)
            .setAuthor({ name: author?.tag ?? "Unknown", iconURL: author?.displayAvatarURL() })
            .setDescription(message.content?.slice(0, 4000) || "*No content*")
            .addFields(
                { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                { name: "Stars", value: `⭐ ${stars}`, inline: true },
            )
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        if (message.attachments.size > 0) {
            const first = message.attachments.first();
            if (first?.contentType?.startsWith("image/")) embed.setImage(first.url);
        }

        return embed;
    }
}
