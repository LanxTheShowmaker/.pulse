import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { success } from "../../design/embeds.js";

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

        await interaction.reply({
            embeds: [success("Suggestion Submitted", `Your suggestion has been posted. React with ✅ or ❌.`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
