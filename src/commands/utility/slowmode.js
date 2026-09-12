import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { success } from "../../design/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("slowmode")
        .setDescription("Set channel slowmode")
        .addIntegerOption(o => o.setName("seconds").setDescription("Slowmode in seconds (0 to disable)").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
        const seconds = interaction.options.getInteger("seconds");
        if (seconds < 0 || seconds > 21600) return interaction.reply({ content: "Max 21600 seconds (6 hours).", flags: MessageFlags.Ephemeral });

        const oldSlowmode = interaction.channel.rateLimitPerUser ?? 0;
        await interaction.channel.setRateLimitPerUser(seconds);

        const format = s => s === 0 ? "Off" : `${s}s`;
        await interaction.reply({
            embeds: [success("Slowmode", `\`${format(oldSlowmode)}\` \u2192 \`${format(seconds)}\``)],
        });
    },
};
