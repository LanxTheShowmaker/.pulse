import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder().setName("staff").setDescription("List server staff"),
    async execute(interaction) {
        const config = await interaction.client.services.settings.get(interaction.guild.id);
        const staffIds = config.staffRoleIds || [];
        const modIds = config.moderatorRoleIds || [];

        const lines = [];
        for (const id of staffIds) {
            const role = interaction.guild.roles.cache.get(id);
            if (role) lines.push(`**${role.name}** — ${role.members.size} member(s)`);
        }
        for (const id of modIds) {
            const role = interaction.guild.roles.cache.get(id);
            if (role) lines.push(`**${role.name}** — ${role.members.size} member(s) (moderator)`);
        }

        if (!lines.length) return interaction.reply({ embeds: [panel("Staff", "No staff roles configured.")], flags: MessageFlags.Ephemeral });
        await interaction.reply({ embeds: [panel("Staff", lines.join("\n"))], flags: MessageFlags.Ephemeral });
    },
};
