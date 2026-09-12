import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel, stat, progressBar } from "../../design/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("level")
        .setDescription("View your or someone's level")
        .addUserOption(o => o.setName("target").setDescription("User to check").setRequired(false)),

    async execute(interaction) {
        const { leveling } = interaction.client.services;
        const target = interaction.options.getUser("target") ?? interaction.user;
        const rank = await leveling.getRank(interaction.guild.id, target.id);

        const percent = Math.round((rank.xp / rank.needed) * 100);
        const bar = progressBar(rank.xp, rank.needed, 15);

        const embed = panel(target.tag, `Level **${rank.level}** — ${rank.xp}/${rank.needed} XP\n\`${bar}\` **${percent}%**`)
            .addFields(
                stat("Rank", `#${rank.rank}`),
                stat("Level", `${rank.level}`),
            )
            .setThumbnail(target.displayAvatarURL({ size: 128 }));

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
