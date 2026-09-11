import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("channelinfo")
        .setDescription("View channel information")
        .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(false)),
    async execute(interaction) {
        const ch = interaction.options.getChannel("channel") ?? interaction.channel;
        const type = {
            0: "Text", 2: "Voice", 4: "Category", 5: "Announcement",
            13: "Stage", 15: "Forum",
        }[ch.type] ?? "Unknown";

        const embed = panel(ch.name, "")
            .addFields(
                { name: "ID", value: ch.id, inline: true },
                { name: "Type", value: type, inline: true },
                { name: "Created", value: `<t:${Math.floor(ch.createdAt.getTime() / 1000)}:R>`, inline: true },
            );

        if (ch.topic) embed.addFields({ name: "Topic", value: ch.topic.slice(0, 1024) });
        if (ch.isTextBased() && ch.nsfw !== undefined) embed.addFields({ name: "NSFW", value: ch.nsfw ? "Yes" : "No", inline: true });
        if (ch.isTextBased() && ch.rateLimitPerUser) embed.addFields({ name: "Slowmode", value: `${ch.rateLimitPerUser}s`, inline: true });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
