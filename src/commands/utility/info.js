import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits, ChannelType } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";
import { isStaff } from "../../core/services.js";

export default {
    data: new SlashCommandBuilder().setName("info").setDescription("Server and user information")
        .addSubcommand(s => s.setName("user").setDescription("Show member info").addUserOption(o => o.setName("user").setDescription("User")).addStringOption(o => o.setName("userid").setDescription("User ID (for users who left)")))
        .addSubcommand(s => s.setName("server").setDescription("Show server info"))
        .addSubcommand(s => s.setName("avatar").setDescription("Show user avatar").addUserOption(o => o.setName("user").setDescription("User")))
        .addSubcommand(s => s.setName("channel").setDescription("Inspect a channel").addChannelOption(o => o.setName("channel").setDescription("Channel")))
        .addSubcommand(s => s.setName("role").setDescription("Inspect a role").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
        .addSubcommand(s => s.setName("permissions").setDescription("Debug user permissions").addUserOption(o => o.setName("user").setDescription("User")).addChannelOption(o => o.setName("channel").setDescription("Channel")))
        .addSubcommand(s => s.setName("staff").setDescription("List staff roles and members")),
    category: "Utility",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ embeds: [embeds.error("Guild only", "Use in a server")], flags: MessageFlags.Ephemeral });

        if (sub === "user") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            let user = interaction.options.getUser("user");
            const userIdStr = interaction.options.getString("userid");
            if (!user && userIdStr) {
                if (!/^\d{17,20}$/.test(userIdStr)) return interaction.editReply({ embeds: [embeds.error("Invalid", "Invalid user ID format")] });
                try { user = await interaction.client.users.fetch(userIdStr); } catch { return interaction.editReply({ embeds: [embeds.error("Not found", "Could not fetch user")] }); }
            }
            if (!user) user = interaction.user;
            let member = null;
            try { member = await guild.members.fetch(user.id); } catch (e) {
                if (e?.code === 10007) {
                    const embed = new EmbedBuilder().setColor(Theme.muted).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
                        .setDescription(`**${user.tag}** — <@${user.id}>\n\n*Not in this server*`)
                        .addFields({ name: "Account Created", value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true });
                    return interaction.editReply({ embeds: [embed] });
                }
                return interaction.editReply({ embeds: [embeds.error("Failed", e.message)] });
            }
            const roles = member.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).first(10);
            const embed = new EmbedBuilder().setColor(Theme.panel).setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL() }).setThumbnail(member.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: "ID", value: `\`${member.id}\``, inline: true },
                    { name: "Username", value: member.user.username, inline: true },
                    { name: "Global Name", value: member.user.globalName || "—", inline: true },
                    { name: "Nickname", value: member.nickname || "—", inline: true },
                    { name: "Joined", value: `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`, inline: true },
                    { name: "Account Created", value: `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`, inline: true },
                    { name: `Roles (${member.roles.cache.size - 1})`, value: roles.map(r => r.toString()).join(", ") || "None" }
                ).setFooter({ text: `${guild.name}` }).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === "server") {
            await interaction.deferReply().catch(() => {});
            const embed = new EmbedBuilder().setColor(Theme.panel).setAuthor({ name: guild.name, iconURL: guild.iconURL() })
                .addFields(
                    { name: "ID", value: `\`${guild.id}\``, inline: true },
                    { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
                    { name: "Members", value: `${guild.memberCount}`, inline: true },
                    { name: "Boosts", value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
                    { name: "Channels", value: `${guild.channels.cache.size}`, inline: true },
                    { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
                    { name: "Created", value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R>`, inline: true }
                ).setThumbnail(guild.iconURL({ size: 256 })).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === "avatar") {
            const user = interaction.options.getUser("user") || interaction.user;
            const avatarURL = user.displayAvatarURL({ size: 512 });
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle(`${user.tag}'s Avatar`).setImage(avatarURL);
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "channel") {
            const channel = interaction.options.getChannel("channel") || interaction.channel;
            const typeMap = { 0: "Text", 2: "Voice", 4: "Category", 5: "Announcement", 10: "Thread", 11: "Public Thread", 12: "Private Thread", 13: "Stage", 15: "Forum" };
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle(`#${channel.name}`)
                .addFields(
                    { name: "ID", value: `\`${channel.id}\``, inline: true },
                    { name: "Type", value: typeMap[channel.type] || "Unknown", inline: true },
                    { name: "Category", value: channel.parent ? channel.parent.name : "—", inline: true },
                    { name: "Position", value: `${channel.position}`, inline: true },
                    { name: "Created", value: `<t:${Math.floor(channel.createdAt.getTime() / 1000)}:R>`, inline: true }
                );
            if (channel.topic) embed.addFields({ name: "Topic", value: channel.topic.slice(0, 1024) });
            if (channel.rateLimitPerUser) embed.addFields({ name: "Slowmode", value: `${channel.rateLimitPerUser}s`, inline: true });
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "role") {
            const role = interaction.options.getRole("role");
            const perms = role.permissions.toArray();
            const embed = new EmbedBuilder().setColor(role.color || Theme.muted).setTitle(`@${role.name}`)
                .addFields(
                    { name: "ID", value: `\`${role.id}\``, inline: true },
                    { name: "Color", value: role.hexColor || "—", inline: true },
                    { name: "Members", value: `${role.members.size}`, inline: true },
                    { name: "Position", value: `${role.position}`, inline: true },
                    { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
                    { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
                    { name: "Managed", value: role.managed ? "Yes" : "No", inline: true },
                    { name: "Created", value: `<t:${Math.floor(role.createdAt.getTime() / 1000)}:R>`, inline: true }
                );
            if (perms.length) embed.addFields({ name: "Permissions", value: perms.slice(0, 20).join(", ") });
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "permissions") {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
            let member;
            try { member = await guild.members.fetch(targetUser.id); } catch { return interaction.reply({ embeds: [embeds.error("Not found", "User not in server")], flags: MessageFlags.Ephemeral }); }
            const everyone = guild.roles.everyone;
            const basePerms = everyone.permissions.toArray();
            const rolePerms = new Set(basePerms);
            for (const role of member.roles.cache.values()) {
                for (const perm of role.permissions.toArray()) rolePerms.add(perm);
            }
            const channelOverwrites = targetChannel.permissionOverwrites.cache;
            const granted = new Set(rolePerms);
            const denied = new Set();
            for (const [, ow] of channelOverwrites) {
                if (ow.type === 0 && member.roles.cache.has(ow.id)) {
                    for (const p of ow.deny.toArray()) { denied.add(p); granted.delete(p); }
                    for (const p of ow.allow.toArray()) { granted.add(p); denied.delete(p); }
                }
                if (ow.type === 1 && ow.id === member.id) {
                    for (const p of ow.deny.toArray()) { denied.add(p); granted.delete(p); }
                    for (const p of ow.allow.toArray()) { granted.add(p); denied.delete(p); }
                }
            }
            const displayPerms = ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "BanMembers", "KickMembers", "ModerateMembers", "ManageMessages", "SendMessages", "ViewChannel", "ReadMessageHistory", "ManageThreads", "CreatePublicThreads", "AttachFiles", "EmbedLinks", "MentionEveryone", "ManageWebhooks", "UseApplicationCommands", "ManageEmojisAndStickers", "ViewAuditLog", "ManageNicknames", "ChangeNickname", "AddReactions", "SendMessagesInThreads", "Connect", "Speak", "UseVAD", "PrioritySpeaker", "ManageEvents"];
            const grantedList = displayPerms.filter(p => granted.has(p));
            const deniedList = displayPerms.filter(p => denied.has(p));
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle(`Permissions — ${targetUser.tag}`).setDescription(`Channel: <#${targetChannel.id}>`)
                .addFields(
                    grantedList.length ? { name: "Granted", value: grantedList.join(", ") } : { name: "Granted", value: "None" },
                    deniedList.length ? { name: "Denied", value: deniedList.join(", ") } : { name: "Denied", value: "None" }
                ).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "staff") {
            const cfg = await interaction.client.services.settings.get(guild.id).catch(() => null);
            const staffIds = cfg?.staffRoleIds ? cfg.staffRoleIds.split(",").filter(Boolean) : [];
            const modIds = cfg?.moderatorRoleIds ? cfg.moderatorRoleIds.split(",").filter(Boolean) : [];
            const lines = [];
            for (const id of staffIds) {
                const role = guild.roles.cache.get(id);
                if (role) lines.push(`**${role.name}** — ${role.members.size} members`);
            }
            for (const id of modIds) {
                const role = guild.roles.cache.get(id);
                if (role) lines.push(`**${role.name}** — ${role.members.size} members`);
            }
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle("Staff").setDescription(lines.length ? lines.join("\n") : "No staff roles configured.");
            return interaction.reply({ embeds: [embed] });
        }
    }
};
