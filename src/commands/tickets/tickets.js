import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags, ChannelType, ButtonStyle } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { success, error, panel, stat } from "../../design/embeds.js";
import { button, row } from "../../design/components.js";
import { Theme } from "../../design/theme.js";

export default {
    category: "tickets",
    data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Ticket system management")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("create")
            .setDescription("Create a support ticket")
            .addStringOption(o => o.setName("reason").setDescription("Reason for opening").setRequired(false))
        )
        .addSubcommand(sub => sub.setName("close").setDescription("Close the current ticket"))
        .addSubcommand(sub => sub.setName("claim").setDescription("Claim the current ticket"))
        .addSubcommand(sub => sub.setName("list").setDescription("List open tickets"))
        .addSubcommand(sub => sub.setName("stats").setDescription("Ticket statistics"))
        .addSubcommand(sub => sub.setName("config").setDescription("Open the ticket configurator panel")),

    async execute(interaction) {
        const { tickets } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "create": return this.handleCreate(interaction, tickets);
            case "close": return this.handleClose(interaction, tickets);
            case "claim": return this.handleClaim(interaction, tickets);
            case "list": return this.handleList(interaction, tickets);
            case "stats": return this.handleStats(interaction, tickets);
            case "config": return this.handleConfig(interaction);
        }
    },

    async handleCreate(interaction, tickets) {
        const existing = await interaction.client.services.prisma.ticket.findFirst({
            where: { guildId: interaction.guild.id, openerId: interaction.user.id, status: { in: ["OPEN", "CLAIMED"] } },
        });
        if (existing) return interaction.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: null,
        });

        await tickets.open(interaction.guild, channel, interaction.user, null, null);
        await interaction.editReply({ embeds: [success("Ticket Created", `<#${channel.id}>`)] });
    },

    async handleClose(interaction, tickets) {
        const ticket = await interaction.client.services.prisma.ticket.findFirst({
            where: { guildId: interaction.guild.id, channelId: interaction.channel.id, status: { in: ["OPEN", "CLAIMED"] } },
        });
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        await tickets.close(interaction.channel.id, interaction.user.id);
        await interaction.reply({ embeds: [success("Ticket Closed", "Channel will be deleted shortly.")] });
    },

    async handleClaim(interaction, tickets) {
        const ticket = await interaction.client.services.prisma.ticket.findFirst({
            where: { guildId: interaction.guild.id, channelId: interaction.channel.id, status: "OPEN" },
        });
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        await tickets.claim(ticket.id, interaction.user.id);
        await interaction.reply({ embeds: [success("Ticket Claimed", `<@${interaction.user.id}> is now handling this ticket.`)] });
    },

    async handleList(interaction, tickets) {
        const list = await tickets.listOpen(interaction.guild.id);
        if (!list.length) return interaction.reply({ embeds: [panel("Open Tickets", "No open tickets.")] });

        const lines = list.map(t => `<#${t.channelId}> — <@${t.openerId}> — <t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`);
        await interaction.reply({ embeds: [panel("Open Tickets", lines.join("\n"))] });
    },

    async handleStats(interaction, tickets) {
        const stats = await tickets.getStats(interaction.guild.id);
        await interaction.reply({
            embeds: [panel("Ticket Stats", [
                stat("Open", stats.open),
                stat("Closed", stats.closed),
                stat("Total", stats.total),
            ].map(f => `${f.name}: **${f.value}**`).join("\n"))],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleConfig(interaction) {
        const prisma = interaction.client.services.prisma;
        const types = await prisma.ticketType.findMany({ where: { guildId: interaction.guild.id } });
        const openCount = await prisma.ticket.count({ where: { guildId: interaction.guild.id, status: { in: ["OPEN", "CLAIMED"] } } });

        const typeLines = types.length
            ? types.map(t => `${t.enabled ? "●" : "○"} **${t.displayName}** — ${t.description || "No description"} — Category: ${t.categoryId ? `<#${t.categoryId}>` : "Default"}`)
            : ["No ticket types configured. Add one to get started."];

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("⚙️ Ticket Configurator")
            .setDescription(typeLines.join("\n"))
            .addFields(
                stat("Open Tickets", openCount),
                stat("Ticket Types", types.length),
            )
            .setTimestamp();

        const components = [
            row(
                button("Set Category", "ticket:config:category", ButtonStyle.Primary),
                button("Set Log Channel", "ticket:config:log", ButtonStyle.Primary),
            ),
            row(
                button("Manage Types", "ticket:config:types", ButtonStyle.Success),
                button("Deploy Panel", "ticket:config:deploy", ButtonStyle.Success),
            ),
        ];

        await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    },
};
