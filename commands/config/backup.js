import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { success, error, panel, stat } from "../../ui/embeds.js";

export default {
    category: "config",
    data: new SlashCommandBuilder()
        .setName("backup")
        .setDescription("Server config backup and restore")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("create")
            .setDescription("Create a backup of current config"))
        .addSubcommand(sub => sub
            .setName("list")
            .setDescription("List recent backups"))
        .addSubcommand(sub => sub
            .setName("restore")
            .setDescription("Restore a backup")
            .addStringOption(o => o.setName("id").setDescription("Backup ID").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("delete")
            .setDescription("Delete a backup")
            .addStringOption(o => o.setName("id").setDescription("Backup ID").setRequired(true))),

    async execute(interaction) {
        const { backups } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "create") {
            const backup = await backups.create(interaction.guild.id, interaction.user.id, interaction.user.tag);
            return interaction.reply({
                embeds: [success("Backup Created", `Backup \`${backup.id}\` created.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === "list") {
            const list = await backups.list(interaction.guild.id);
            if (!list.length) {
                return interaction.reply({ embeds: [panel("Backups", "No backups found.")], flags: MessageFlags.Ephemeral });
            }

            const lines = list.map(b =>
                `\`${b.id}\` — by <@${b.createdById}> — ${b.createdAt.toLocaleDateString()}`
            );

            return interaction.reply({ embeds: [panel("Backups", lines.join("\n"))], flags: MessageFlags.Ephemeral });
        }

        if (sub === "restore") {
            const id = interaction.options.getString("id");
            const result = await backups.restore(id);
            if (!result.ok) {
                return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ embeds: [success("Restored", "Config restored from backup. Some changes may require a restart.")], flags: MessageFlags.Ephemeral });
        }

        if (sub === "delete") {
            const id = interaction.options.getString("id");
            await backups.delete(id);
            return interaction.reply({ embeds: [success("Deleted", "Backup deleted.")], flags: MessageFlags.Ephemeral });
        }
    },
};
