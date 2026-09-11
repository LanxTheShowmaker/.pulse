import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

const KEY_PERMS = [
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
    ["ViewChannel", PermissionFlagsBits.ViewChannel],
    ["SendMessages", PermissionFlagsBits.SendMessages],
    ["SendMessagesInThreads", PermissionFlagsBits.SendMessagesInThreads],
    ["EmbedLinks", PermissionFlagsBits.EmbedLinks],
    ["AttachFiles", PermissionFlagsBits.AttachFiles],
    ["AddReactions", PermissionFlagsBits.AddReactions],
    ["MentionEveryone", PermissionFlagsBits.MentionEveryone],
    ["ManageWebhooks", PermissionFlagsBits.ManageWebhooks],
    ["Connect", PermissionFlagsBits.Connect],
    ["Speak", PermissionFlagsBits.Speak],
    ["UseVAD", PermissionFlagsBits.UseVAD],
    ["PrioritySpeaker", PermissionFlagsBits.PrioritySpeaker],
    ["MuteMembers", PermissionFlagsBits.MuteMembers],
    ["DeafenMembers", PermissionFlagsBits.DeafenMembers],
    ["MoveMembers", PermissionFlagsBits.MoveMembers],
];

export default {
    data: new SlashCommandBuilder()
        .setName("permissions")
        .setDescription("Debug a user's effective permissions in a channel")
        .addUserOption(o => o.setName("user").setDescription("User to check (defaults to you)").setRequired(false))
        .addChannelOption(o => o.setName("channel").setDescription("Channel to check (defaults to current)").setRequired(false)),
    category: "Utility",
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ embeds: [embeds.error("Guild only", "Use in a server")], flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const targetUser = interaction.options.getUser("user") ?? interaction.user;
        const channel = interaction.options.getChannel("channel") ?? interaction.channel;

        let member;
        try {
            member = await guild.members.fetch(targetUser.id);
        } catch {
            return interaction.editReply({ embeds: [embeds.error("Not found", `${targetUser.tag} is not in this server.`)] }).catch(() => {});
        }

        const everyoneRole = guild.roles.everyone;
        const memberRoles = member.roles.cache.filter(r => r.id !== guild.id);

        const granted = new Set();
        const denied = new Set();

        granted.add(...everyoneRole.permissions.toArray());
        denied.delete(...everyoneRole.permissions.toArray());

        for (const role of memberRoles) {
            for (const [name, flag] of KEY_PERMS) {
                if (role.permissions.has(flag)) {
                    granted.add(name);
                    denied.delete(name);
                }
            }
        }

        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(Theme.success)
                    .setAuthor({ name: "Permission Debug", iconURL: guild.iconURL({ size: 64 }) ?? undefined })
                    .setTitle(`${member.user.tag}`)
                    .setDescription(`<@${member.id}> has **Administrator** — all permissions granted in all channels.`)
                    .addFields(
                        { name: "Roles", value: memberRoles.size > 0 ? memberRoles.sort((a, b) => b.position - a.position).first(10).map(r => r.toString()).join(", ") : "None" },
                    )
                    .setFooter({ text: `${guild.name} • #${channel.name}` })
                    .setTimestamp()
                ]
            }).catch(() => {});
        }

        const override = channel.permissionOverwrites.cache.get(member.id);
        const roleOverrides = [];
        for (const role of memberRoles) {
            const ov = channel.permissionOverwrites.cache.get(role.id);
            if (ov) roleOverrides.push({ role, allow: ov.allow, deny: ov.deny });
        }

        for (const ov of roleOverrides) {
            for (const [name, flag] of KEY_PERMS) {
                if (ov.allow.has(flag)) {
                    granted.add(name);
                    denied.delete(name);
                }
                if (ov.deny.has(flag)) {
                    denied.add(name);
                    granted.delete(name);
                }
            }
        }

        if (override) {
            for (const [name, flag] of KEY_PERMS) {
                if (override.allow.has(flag)) {
                    granted.add(name);
                    denied.delete(name);
                }
                if (override.deny.has(flag)) {
                    denied.add(name);
                    granted.delete(name);
                }
            }
        }

        const grantedList = KEY_PERMS.filter(([name]) => granted.has(name)).map(([name]) => `\`${name}\``);
        const deniedList = KEY_PERMS.filter(([name]) => denied.has(name)).map(([name]) => `\`${name}\``);

        const fields = [];
        if (grantedList.length) {
            fields.push({ name: `Granted (${grantedList.length})`, value: grantedList.join(", ") });
        }
        if (deniedList.length) {
            fields.push({ name: `Denied (${deniedList.length})`, value: deniedList.join(", ") });
        }

        if (override) {
            const ow = [];
            if (override.allow.bitfield) ow.push(`Allow: \`${override.allow.bitfield}\``);
            if (override.deny.bitfield) ow.push(`Deny: \`${override.deny.bitfield}\``);
            if (ow.length) fields.push({ name: "Channel Override (user)", value: ow.join("\n") });
        }

        if (roleOverrides.length) {
            const lines = roleOverrides.map(r => `**${r.role.name}**: allow \`${r.allow.bitfield}\` deny \`${r.deny.bitfield}\``);
            fields.push({ name: "Channel Overrides (roles)", value: lines.join("\n").slice(0, 1024) });
        }

        const embed = new EmbedBuilder()
            .setColor(Theme.info)
            .setAuthor({ name: "Permission Debug", iconURL: guild.iconURL({ size: 64 }) ?? undefined })
            .setTitle(`${member.user.tag}`)
            .setDescription(`<@${member.id}> in <#${channel.id}>`)
            .addFields(
                { name: "Roles", value: memberRoles.size > 0 ? memberRoles.sort((a, b) => b.position - a.position).first(10).map(r => r.toString()).join(", ") : "None" },
                ...fields,
            )
            .setFooter({ text: `${guild.name} • Resolved permissions` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
};
