import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class StarboardService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;
        if (reaction.emoji.name !== "⭐") return;

        const message = reaction.message;
        if (!message.guild) return;

        const config = await this.prisma.starboardConfig.findUnique({ where: { guildId: message.guild.id } });
        if (!config) return;

        const stars = reaction.count ?? 0;
        if (stars < config.threshold) return;

        const ch = message.guild.channels.cache.get(config.channelId);
        if (!ch?.isTextBased()) return;

        // Check if already starred
        const existing = await this.prisma.$queryRaw`
            SELECT "id" FROM "StarboardConfig" WHERE "guildId" = ${message.guild.id}
        `;

        const embed = new EmbedBuilder()
            .setColor(Theme.gold)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
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

        await ch.send({ embeds: [embed] }).catch(e => logger.warn("starboard", "send failed", e.message));
    }
}
