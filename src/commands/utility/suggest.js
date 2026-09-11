import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("suggest")
        .setDescription("Submit a suggestion")
        .addStringOption(o => o.setName("content").setDescription("Your suggestion").setRequired(true)),

    async execute(interaction) {
        const { suggestions } = interaction.client.services;
        const content = interaction.options.getString("content");

        const channel = interaction.channel;
        const result = await suggestions.create(interaction.guild, channel, interaction.user, content);

        const embed = panel("Suggestion Submitted", content)
            .addFields(
                { name: "Status", value: "\u23F3 Pending", inline: true },
                { name: "Author", value: `${interaction.user}`, inline: true },
            );

        await interaction.reply({ embeds: [embed] });
    },
};
