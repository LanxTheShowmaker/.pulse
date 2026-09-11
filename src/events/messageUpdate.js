import { Events } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage, client) {
        if (oldMessage.author?.bot || !oldMessage.guild) return;
        if (oldMessage.content === newMessage.content) return;
        try {
            const config = await client.services.settings.get(oldMessage.guild.id);
            if (!config.logChannelId) return;
            const ch = oldMessage.guild.channels.cache.get(config.logChannelId);
            if (!ch?.isTextBased()) return;

            const embed = new EmbedBuilder()
                .setColor(Theme.accent)
                .setTitle("Message Edited")
                .addFields(
                    { name: "Before", value: oldMessage.content?.slice(0, 1024) || "*empty*", inline: false },
                    { name: "After", value: newMessage.content?.slice(0, 1024) || "*empty*", inline: false },
                    { name: "Channel", value: `<#${oldMessage.channel.id}>`, inline: true },
                    { name: "Author", value: `<@${oldMessage.author.id}>`, inline: true },
                )
                .setFooter({ text: Brand.footer })
                .setTimestamp();

            await ch.send({ embeds: [embed] }).catch(() => {});
        } catch (e) {
            logger.error("events", "messageUpdate failed", e.message);
        }
    },
};
