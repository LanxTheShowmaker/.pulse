import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("roleinfo")
        .setDescription("View role information")
        .addRoleOption(o => o.setName("role").setDescription("Role to inspect").setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole("role");
        const members = role.members.size;
        const perms = role.permissions.toArray();
        const permList = perms.length > 5 ? perms.slice(0, 5).join(", ") + ` +${perms.length - 5} more` : perms.join(", ") || "None";

        const embed = panel(role.name, "")
            .addFields(
                { name: "ID", value: role.id, inline: true },
                { name: "Color", value: role.hexColor, inline: true },
                { name: "Members", value: `${members}`, inline: true },
                { name: "Position", value: `${role.position}`, inline: true },
                { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
                { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
                { name: "Permissions", value: permList },
            )
            .setColor(role.color || undefined);

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
