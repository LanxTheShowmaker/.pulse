import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { success, error, panel, stat } from "../../ui/embeds.js";

export default {
    category: "config",
    data: new SlashCommandBuilder()
        .setName("reactionrole")
        .setDescription("Manage reaction roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("add")
            .setDescription("Add a reaction role to a message")
            .addStringOption(o => o.setName("message-id").setDescription("Message ID").setRequired(true))
            .addStringOption(o => o.setName("emoji").setDescription("Emoji to react with").setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("Role to assign").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("remove")
            .setDescription("Remove a reaction role")
            .addStringOption(o => o.setName("message-id").setDescription("Message ID").setRequired(true))
            .addStringOption(o => o.setName("emoji").setDescription("Emoji to remove").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("list")
            .setDescription("List reaction roles for a message")
            .addStringOption(o => o.setName("message-id").setDescription("Message ID").setRequired(true))),

    async execute(interaction) {
        const { reactionRoles } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
            const messageId = interaction.options.getString("message-id");
            const emoji = interaction.options.getString("emoji");
            const role = interaction.options.getRole("role");

            // Verify message exists in this channel
            const channel = interaction.channel;
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return interaction.reply({ embeds: [error("Not Found", "Message not found in this channel.")], flags: MessageFlags.Ephemeral });
            }

            // Check if already exists
            const existing = await reactionRoles.prisma.reactionRole.findFirst({
                where: { guildId: interaction.guild.id, messageId, emoji },
            });
            if (existing) {
                return interaction.reply({ embeds: [error("Duplicate", "That emoji is already mapped to a role on this message.")], flags: MessageFlags.Ephemeral });
            }

            await reactionRoles.add(interaction.guild.id, channel.id, messageId, emoji, role.id);
            await reactionRoles.prisma.$queryRaw`SELECT 1`; // ensure DB is ready

            // Add the reaction to the message
            await message.react(emoji).catch(() => {});

            await interaction.reply({
                embeds: [success("Reaction Role Added", `Reacting with **${emoji}** on that message will now assign <@&${role.id}>.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === "remove") {
            const messageId = interaction.options.getString("message-id");
            const emoji = interaction.options.getString("emoji");

            const result = await reactionRoles.remove(interaction.guild.id, messageId, emoji);
            if (result.count === 0) {
                return interaction.reply({ embeds: [error("Not Found", "No reaction role found for that emoji on that message.")], flags: MessageFlags.Ephemeral });
            }

            await interaction.reply({
                embeds: [success("Reaction Role Removed", `Removed reaction role for **${emoji}**.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === "list") {
            const messageId = interaction.options.getString("message-id");
            const roles = await reactionRoles.getByMessage(messageId);

            if (!roles.length) {
                return interaction.reply({ embeds: [panel("Reaction Roles", "No reaction roles on that message.")], flags: MessageFlags.Ephemeral });
            }

            const lines = roles.map(r => `${r.emoji} → <@&${r.roleId}>`);
            const embed = panel("Reaction Roles", lines.join("\n"));
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
