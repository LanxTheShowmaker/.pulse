import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { panel, stat } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("roleinfo")
        .setDescription("View role information")
        .addRoleOption(o => o.setName("role").setDescription("Role to inspect").setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole("role");
        const perms = role.permissions.toArray();

        const embed = panel(role.name, "")
            .addFields(
                stat("Color", `\`${role.hexColor}\``),
                stat("Members", `${role.members.size}`),
                stat("Position", `${role.position}`),
                stat("Hoisted", role.hoist ? "Yes" : "No"),
                stat("Mentionable", role.mentionable ? "Yes" : "No"),
                stat("Created", `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`),
                stat("Permissions", `${perms.length} permission(s)`),
            )
            .setColor(role.color || undefined);

        await interaction.reply({ embeds: [embed] });
    },
};
