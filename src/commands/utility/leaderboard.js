import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the level leaderboard"),

    async execute(interaction) {
        const { leveling } = interaction.client.services;
        const list = await leveling.getLeaderboard(interaction.guild.id, 10);

        if (!list.length) return interaction.reply({ embeds: [panel("Leaderboard", "No data yet.")], flags: MessageFlags.Ephemeral });

        const lines = list.map((e, i) => `\`${i + 1}.\` <@${e.userId}> — Level **${e.level}** (${e.xp} XP)`);
        await interaction.reply({ embeds: [panel("Leaderboard", lines.join("\n"))], flags: MessageFlags.Ephemeral });
    },
};
