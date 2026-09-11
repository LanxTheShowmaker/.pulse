import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

export default {
    data: new SlashCommandBuilder()
        .setName("staff")
        .setDescription("List staff roles and their members")
        .addBooleanOption(o => o.setName("show_members").setDescription("Show individual members (default: true)").setRequired(false)),
    category: "Utility",
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ embeds: [embeds.error("Guild only", "Use in a server")], flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const config = await interaction.client.services.settings.get(guild.id).catch(() => null);
        const staffRoleIds = config?.staffRoleIds ?? [];
        const modRoleIds = config?.moderatorRoleIds ?? [];

        if (!staffRoleIds.length && !modRoleIds.length) {
            return interaction.editReply({ embeds: [embeds.info("No Staff Roles", "No staff or moderator roles are configured. Use `/config staff` to set them up.")] }).catch(() => {});
        }

        const showMembers = interaction.options.getBoolean("show_members") ?? true;
        const fields = [];

        if (staffRoleIds.length) {
            for (const roleId of staffRoleIds) {
                const role = guild.roles.cache.get(roleId);
                if (!role) {
                    fields.push({ name: `Unknown Role (\`${roleId}\`)`, value: "> Role not found", inline: false });
                    continue;
                }
                const members = role.members;
                const count = members.size;
                if (showMembers && count > 0) {
                    const list = members.first(20).map(m => m.toString()).join(", ");
                    const extra = count > 20 ? `\n... and ${count - 20} more` : "";
                    fields.push({ name: `${role.name} — ${count}`, value: `> ${list}${extra}`, inline: false });
                } else {
                    fields.push({ name: role.name, value: `> **${count}** member${count !== 1 ? "s" : ""}`, inline: true });
                }
            }
        }

        if (modRoleIds.length) {
            for (const roleId of modRoleIds) {
                const role = guild.roles.cache.get(roleId);
                if (!role) {
                    fields.push({ name: `Unknown Role (\`${roleId}\`)`, value: "> Role not found", inline: false });
                    continue;
                }
                const members = role.members;
                const count = members.size;
                if (showMembers && count > 0) {
                    const list = members.first(20).map(m => m.toString()).join(", ");
                    const extra = count > 20 ? `\n... and ${count - 20} more` : "";
                    fields.push({ name: `${role.name} — ${count} (mod)`, value: `> ${list}${extra}`, inline: false });
                } else {
                    fields.push({ name: `${role.name} (mod)`, value: `> **${count}** member${count !== 1 ? "s" : ""}`, inline: true });
                }
            }
        }

        if (!fields.length) {
            return interaction.editReply({ embeds: [embeds.info("Staff", "No staff roles found in this server.")]}).catch(() => {});
        }

        const totalStaff = staffRoleIds.reduce((sum, id) => {
            const r = guild.roles.cache.get(id);
            return sum + (r?.members.size ?? 0);
        }, 0);
        const totalMod = modRoleIds.reduce((sum, id) => {
            const r = guild.roles.cache.get(id);
            return sum + (r?.members.size ?? 0);
        }, 0);

        const embed = new EmbedBuilder()
            .setColor(Theme.accent)
            .setAuthor({ name: "Staff", iconURL: guild.iconURL({ size: 64 }) ?? undefined })
            .setTitle("Staff & Moderator Roles")
            .addFields(fields)
            .setFooter({ text: `${guild.name} • ${totalStaff} staff, ${totalMod} moderators` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
};
