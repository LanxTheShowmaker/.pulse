import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

export default {
    data: new SlashCommandBuilder()
        .setName("level")
        .setDescription("View your or someone's level")
        .addUserOption(o => o.setName("target").setDescription("User to check").setRequired(false)),

    async execute(interaction) {
        const { leveling } = interaction.client.services;
        const target = interaction.options.getUser("target") ?? interaction.user;
        const rank = await leveling.getRank(interaction.guild.id, target.id);

        const progress = Math.round((rank.xp / rank.needed) * 10);
        const bar = "█".repeat(progress) + "░".repeat(10 - progress);

        const embed = panel(`${target.tag}`, `\`${bar}\` ${rank.xp}/${rank.needed} XP`)
            .addFields(
                { name: "Level", value: `${rank.level}`, inline: true },
                { name: "Rank", value: `#${rank.rank}`, inline: true },
            )
            .setThumbnail(target.displayAvatarURL({ size: 128 }));

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
