import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel, stat } from "../../ui/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder().setName("staff").setDescription("List server staff"),
    async execute(interaction) {
        const config = await interaction.client.services.settings.get(interaction.guild.id);
        const staffIds = config.staffRoleIds || [];
        const modIds = config.moderatorRoleIds || [];

        const embed = panel("Staff", "");

        for (const id of staffIds) {
            const role = interaction.guild.roles.cache.get(id);
            if (role) embed.addFields(stat(`${role.name}`, `${role.members.size} member(s)`));
        }
        for (const id of modIds) {
            const role = interaction.guild.roles.cache.get(id);
            if (role) embed.addFields(stat(`${role.name}`, `${role.members.size} member(s) \u2022 Moderator`));
        }

        if (!embed.data.fields?.length) {
            return interaction.reply({ embeds: [panel("Staff", "No staff roles configured.")] });
        }
        await interaction.reply({ embeds: [embed] });
    },
};
