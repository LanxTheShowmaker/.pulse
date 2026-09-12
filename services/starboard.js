import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class StarboardService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const config = await this.prisma.starboardConfig.findUnique({ where: { guildId: reaction.message.guild.id } });
        if (!config) return;
        if (reaction.emoji.name !== config.emoji) return;

        const message = reaction.message;
        const stars = reaction.count ?? 0;
        if (stars < config.threshold) return;

        const ch = message.guild.channels.cache.get(config.channelId);
        if (!ch?.isTextBased()) return;

        const existing = await this.prisma.starboardEntry.findUnique({
            where: { guildId_originalId: { guildId: message.guild.id, originalId: message.id } },
        });

        if (existing) {
            // Update existing starboard post
            const starMsg = await ch.messages.fetch(existing.starboardId).catch(() => null);
            if (starMsg) {
                const embed = this.buildEmbed(message, stars);
                await starMsg.edit({ embeds: [embed] }).catch(() => {});
            }
            await this.prisma.starboardEntry.update({
                where: { id: existing.id },
                data: { starCount: stars },
            }).catch(() => {});
            return;
        }

        // Create new starboard post
        const embed = this.buildEmbed(message, stars);
        const sent = await ch.send({ embeds: [embed] }).catch(e => {
            logger.warn("starboard", "send failed", e.message);
            return null;
        });
        if (!sent) return;

        await this.prisma.starboardEntry.create({
            data: {
                guildId: message.guild.id,
                originalId: message.id,
                starboardId: sent.id,
                starCount: stars,
            },
        });
    }

    async handleReactionRemove(reaction, user) {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const config = await this.prisma.starboardConfig.findUnique({ where: { guildId: reaction.message.guild.id } });
        if (!config) return;
        if (reaction.emoji.name !== config.emoji) return;

        const message = reaction.message;

        const entry = await this.prisma.starboardEntry.findUnique({
            where: { guildId_originalId: { guildId: message.guild.id, originalId: message.id } },
        });
        if (!entry) return;

        const newCount = reaction.count ?? 0;

        if (newCount < config.threshold) {
            // Below threshold — delete starboard post
            const ch = message.guild.channels.cache.get(config.channelId);
            if (ch) {
                await ch.messages.delete(entry.starboardId).catch(() => {});
            }
            await this.prisma.starboardEntry.delete({ where: { id: entry.id } }).catch(() => {});
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
        await this.prisma.starboardEntry.update({
            where: { id: entry.id },
            data: { starCount: newCount },
        }).catch(() => {});
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
