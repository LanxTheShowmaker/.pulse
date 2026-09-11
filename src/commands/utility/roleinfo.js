import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

const KNOWN_PERMS = [
    ["Administrator", PermissionFlagsBits.Administrator],
    ["ManageGuild", PermissionFlagsBits.ManageGuild],
    ["ManageRoles", PermissionFlagsBits.ManageRoles],
    ["ManageChannels", PermissionFlagsBits.ManageChannels],
    ["ManageMessages", PermissionFlagsBits.ManageMessages],
    ["ManageThreads", PermissionFlagsBits.ManageThreads],
    ["ManageEvents", PermissionFlagsBits.ManageEvents],
    ["ManageNicknames", PermissionFlagsBits.ManageNicknames],
    ["BanMembers", PermissionFlagsBits.BanMembers],
    ["KickMembers", PermissionFlagsBits.KickMembers],
    ["ModerateMembers", PermissionFlagsBits.ModerateMembers],
    ["ViewAuditLog", PermissionFlagsBits.ViewAuditLog],
    ["ViewGuildInsights", PermissionFlagsBits.ViewGuildInsights],
    ["ViewChannel", PermissionFlagsBits.ViewChannel],
    ["SendMessages", PermissionFlagsBits.SendMessages],
    ["SendMessagesInThreads", PermissionFlagsBits.SendMessagesInThreads],
    ["CreatePublicThreads", PermissionFlagsBits.CreatePublicThreads],
    ["CreatePrivateThreads", PermissionFlagsBits.CreatePrivateThreads],
    ["EmbedLinks", PermissionFlagsBits.EmbedLinks],
    ["AttachFiles", PermissionFlagsBits.AttachFiles],
    ["AddReactions", PermissionFlagsBits.AddReactions],
    ["UseExternalEmojis", PermissionFlagsBits.UseExternalEmojis],
    ["MentionEveryone", PermissionFlagsBits.MentionEveryone],
    ["ManageWebhooks", PermissionFlagsBits.ManageWebhooks],
    ["ChangeNickname", PermissionFlagsBits.ChangeNickname],
    ["UseApplicationCommands", PermissionFlagsBits.UseApplicationCommands],
    ["Connect", PermissionFlagsBits.Connect],
    ["Speak", PermissionFlagsBits.Speak],
    ["Stream", PermissionFlagsBits.Stream],
    ["UseVAD", PermissionFlagsBits.UseVAD],
    ["PrioritySpeaker", PermissionFlagsBits.PrioritySpeaker],
    ["MuteMembers", PermissionFlagsBits.MuteMembers],
    ["DeafenMembers", PermissionFlagsBits.DeafenMembers],
    ["MoveMembers", PermissionFlagsBits.MoveMembers],
    ["ManageEmojisAndStickers", PermissionFlagsBits.ManageEmojisAndStickers],
    ["ReadMessageHistory", PermissionFlagsBits.ReadMessageHistory],
];

export default {
    data: new SlashCommandBuilder()
        .setName("roleinfo")
        .setDescription("Inspect a role's permissions, members, and position")
        .addRoleOption(o => o.setName("role").setDescription("Role to inspect").setRequired(true)),
    category: "Utility",
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ embeds: [embeds.error("Guild only", "Use in a server")], flags: MessageFlags.Ephemeral });

        const role = interaction.options.getRole("role");
        if (!role) return interaction.reply({ embeds: [embeds.error("Not found", "Role not found")], flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const isManaged = role.managed;
        const isHoisted = role.hoist;
        const isMentionable = role.mentionable;
        const position = role.position;
        const totalRoles = guild.roles.cache.size;
        const color = role.hexColor !== "#000000" ? role.hexColor : "Default";

        const memberCount = role.members.size;

        const perms = role.permissions.toArray();
        const keyPerms = KNOWN_PERMS.filter(([, flag]) => role.permissions.has(flag)).map(([name]) => name);
        const permCount = perms.length;
        const permDisplay = keyPerms.length > 0 ? keyPerms.slice(0, 15).join(", ") + (keyPerms.length > 15 ? ` ... (+${keyPerms.length - 15})` : "") : "None";

        const created = role.createdAt ? `<t:${Math.floor(role.createdAt.getTime() / 1000)}:R>` : "—";

        const embed = new EmbedBuilder()
            .setColor(role.color || Theme.info)
            .setAuthor({ name: `Role Information`, iconURL: guild.iconURL({ size: 64 }) ?? undefined })
            .setTitle(`@${role.name}`)
            .addFields(
                { name: "ID", value: `\`${role.id}\``, inline: true },
                { name: "Position", value: `> **${position}** / ${totalRoles}`, inline: true },
                { name: "Color", value: `> ${color}`, inline: true },
                { name: "Members", value: `> **${memberCount}**`, inline: true },
                { name: "Hoisted", value: `> ${isHoisted ? "Yes" : "No"}`, inline: true },
                { name: "Mentionable", value: `> ${isMentionable ? "Yes" : "No"}`, inline: true },
                { name: "Managed", value: `> ${isManaged ? "Yes (integration)" : "No"}`, inline: true },
                { name: "Created", value: `> ${created}`, inline: true },
                { name: `Permissions (${permCount})`, value: `> ${permDisplay}` },
            )
            .setFooter({ text: `${guild.name} • ${memberCount} member${memberCount !== 1 ? "s" : ""}` })
            .setTimestamp();

        if (role.icon) embed.setThumbnail(role.iconURL({ size: 256 }));

        if (memberCount > 0 && memberCount <= 30) {
            embed.addFields({ name: "Members", value: `> ${role.members.map(m => m.toString()).join(", ")}` });
        }

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
};
