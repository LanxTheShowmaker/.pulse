import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags, ChannelType } from "discord.js";
import { success, error, panel } from "../../design/embeds.js";
import { requireModerator, ephemeral } from "../moderation/shared.js";

export default {
    data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Ticket system management")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("create")
            .setDescription("Create a support ticket")
            .addStringOption(o => o.setName("reason").setDescription("Reason for opening").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("close")
            .setDescription("Close the current ticket")
        )
        .addSubcommand(sub => sub
            .setName("claim")
            .setDescription("Claim the current ticket")
        )
        .addSubcommand(sub => sub.setName("list").setDescription("List open tickets"))
        .addSubcommand(sub => sub.setName("stats").setDescription("Ticket statistics")),

    async execute(interaction) {
        const { tickets } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "create": {
                const reason = interaction.options.getString("reason") ?? "No reason provided";

                // Check for existing open ticket
                const existing = await interaction.client.services.prisma.ticket.findFirst({
                    where: { guildId: interaction.guild.id, openerId: interaction.user.id, status: { in: ["OPEN", "CLAIMED"] } },
                });
                if (existing) return ephemeral(interaction, `You already have an open ticket: <#${existing.channelId}>`);

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const channel = await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: null,
                });

                const ticket = await tickets.open(interaction.guild, channel, interaction.user, null, null);
                await interaction.editReply({ embeds: [success("Ticket Created", `<#${channel.id}>`)] });
                break;
            }

            case "close": {
                const ticket = await interaction.client.services.prisma.ticket.findFirst({
                    where: { guildId: interaction.guild.id, channelId: interaction.channel.id, status: { in: ["OPEN", "CLAIMED"] } },
                });
                if (!ticket) return ephemeral(interaction, "No open ticket in this channel.");

                await tickets.close(interaction.channel.id, interaction.user.id);
                await interaction.reply({ embeds: [success("Ticket Closed", "Channel will be deleted shortly.")] });
                break;
            }

            case "claim": {
                const ticket = await interaction.client.services.prisma.ticket.findFirst({
                    where: { guildId: interaction.guild.id, channelId: interaction.channel.id, status: "OPEN" },
                });
                if (!ticket) return ephemeral(interaction, "No open ticket in this channel.");

                await tickets.claim(ticket.id, interaction.user.id);
                await interaction.reply({ embeds: [success("Ticket Claimed", `<@${interaction.user.id}> is now handling this ticket.`)] });
                break;
            }

            case "list": {
                const list = await tickets.listOpen(interaction.guild.id);
                if (!list.length) return ephemeral(interaction, "No open tickets.");

                const lines = list.map(t => `<#${t.channelId}> — opened by <@${t.openerId}> — <t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`);
                await interaction.reply({ embeds: [panel("Open Tickets", lines.join("\n"))], flags: MessageFlags.Ephemeral });
                break;
            }

            case "stats": {
                const stats = await tickets.getStats(interaction.guild.id);
                await interaction.reply({
                    embeds: [panel("Ticket Stats", `Open: **${stats.open}**\nClosed: **${stats.closed}**\nTotal: **${stats.total}**`)],
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }
        }
    },
};
