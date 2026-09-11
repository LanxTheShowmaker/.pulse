import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { panel } from "../../design/embeds.js";

const KEY_PERMS = [
    ["Administrator", "Administrator"],
    ["ManageGuild", "Manage Server"],
    ["BanMembers", "Ban Members"],
    ["KickMembers", "Kick Members"],
    ["ModerateMembers", "Moderate Members"],
    ["ManageMessages", "Manage Messages"],
    ["ManageChannels", "Manage Channels"],
    ["ManageRoles", "Manage Roles"],
    ["ViewAuditLog", "View Audit Log"],
];

export default {
    data: new SlashCommandBuilder()
        .setName("permissions")
        .setDescription("Check your or someone's permissions")
        .addUserOption(o => o.setName("target").setDescription("User to check").setRequired(false)),
    async execute(interaction) {
        const target = interaction.options.getUser("target") ?? interaction.user;
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "User not found in this server.", flags: MessageFlags.Ephemeral });

        const lines = KEY_PERMS.map(([perm, label]) => {
            const has = member.permissions.has(PermissionFlagsBits[perm]);
            return `${has ? "●" : "○"} **${label}**`;
        });

        const embed = panel(`${target.tag} — Permissions`, lines.join("\n"));
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
