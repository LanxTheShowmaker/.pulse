import { Events } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.MessageDelete,
    async execute(message, client) {
        if (message.author?.bot || !message.guild) return;
        try {
            const config = await client.services.settings.get(message.guild.id);
            if (!config.logChannelId) return;
            const ch = message.guild.channels.cache.get(config.logChannelId);
            if (!ch?.isTextBased()) return;

            const embed = new EmbedBuilder()
                .setColor(Theme.danger)
                .setTitle("Message Deleted")
                .setDescription(message.content?.slice(0, 4000) || "*No content*")
                .addFields(
                    { name: "Author", value: `<@${message.author.id}>`, inline: true },
                    { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                )
                .setFooter({ text: Brand.footer })
                .setTimestamp();

            await ch.send({ embeds: [embed] }).catch(() => {});
        } catch (e) {
            logger.error("events", "messageDelete failed", e.message);
        }
    },
};
