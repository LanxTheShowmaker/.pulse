import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

const MEDALS = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the level leaderboard"),

    async execute(interaction) {
        const { leveling } = interaction.client.services;
        const list = await leveling.getLeaderboard(interaction.guild.id, 10);

        if (!list.length) return interaction.reply({ embeds: [panel("Leaderboard", "No data yet.")] });

        const lines = list.map((e, i) => {
            const medal = i < 3 ? MEDALS[i] : `\`${i + 1}.\``;
            return `${medal} <@${e.userId}> — Level **${e.level}** (${e.xp} XP)`;
        });
        await interaction.reply({ embeds: [panel("Leaderboard", lines.join("\n"))] });
    },
};
