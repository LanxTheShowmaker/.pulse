import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { containerReply, containerFollowUp } from "../../design/containers/base.js";
import { successPanel, errorPanel, infoPanel } from "../../design/containers/panels.js";
import { ticketTypeConfigPanel, ticketTypeEditPanel, ticketStatsPanel, ticketListPanel } from "../../design/containers/tickets.js";
import { embeds } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Manage the ticket system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName("config").setDescription("View ticket system configuration"))
        .addSubcommand(s => s.setName("create-type").setDescription("Create a new ticket type")
            .addStringOption(o => o.setName("key").setDescription("Unique key (e.g., support)").setRequired(true))
            .addStringOption(o => o.setName("name").setDescription("Display name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Description").setRequired(false))
            .addChannelOption(o => o.setName("category").setDescription("Category channel").addChannelTypes(4).setRequired(false))
            .addRoleOption(o => o.setName("staff-role").setDescription("Staff role").setRequired(false))
            .addStringOption(o => o.setName("emoji").setDescription("Emoji").setRequired(false))
        )
        .addSubcommand(s => s.setName("edit-type").setDescription("Edit a ticket type")
            .addStringOption(o => o.setName("key").setDescription("Ticket type key").setRequired(true))
        )
        .addSubcommand(s => s.setName("delete-type").setDescription("Delete a ticket type")
            .addStringOption(o => o.setName("key").setDescription("Ticket type key").setRequired(true))
        )
        .addSubcommand(s => s.setName("panel").setDescription("Post ticket panel to a channel")
            .addChannelOption(o => o.setName("channel").setDescription("Channel to post in").addChannelTypes(0).setRequired(true))
        )
        .addSubcommand(s => s.setName("list").setDescription("List open tickets")
            .addStringOption(o => o.setName("status").setDescription("Filter by status").addChoices(
                { name: "Open", value: "OPEN" },
                { name: "Claimed", value: "CLAIMED" },
                { name: "Closed", value: "CLOSED" },
                { name: "All", value: "ALL" },
            ).setRequired(false))
            .addIntegerOption(o => o.setName("page").setDescription("Page number").setMinValue(1).setRequired(false))
        )
        .addSubcommand(s => s.setName("stats").setDescription("View ticket statistics")),
    category: "Config",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const prisma = interaction.client.prisma;
        const guild = interaction.guild;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
        }

        if (sub === "config") {
            const types = await prisma.ticketType.findMany({ where: { guildId: guild.id } }).catch(() => []);
            const panels = await interaction.client.services.panels.list(guild.id).catch(() => []);
            const ticketEnabled = panels.some(p => p.enabled);
            const lines = [
                `**Tickets** ${ticketEnabled ? "Enabled" : "Disabled"}`,
                `**Types** ${types.length} configured`,
            ];
            for (const t of types) {
                lines.push(`${t.enabled ? "\u25cf" : "\u25cb"} **${t.displayName}** (\`${t.key}\`) \u2014 ${t.panelType}`);
            }
            return containerReply(interaction, infoPanel("Ticket Configuration", lines.join("\n")), true);
        }

        if (sub === "create-type") {
            const key = interaction.options.getString("key").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32);
            const name = interaction.options.getString("name");
            const description = interaction.options.getString("description") || "";
            const category = interaction.options.getChannel("category");
            const staffRole = interaction.options.getRole("staff-role");
            const emoji = interaction.options.getString("emoji") || "";

            const exists = await prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } });
            if (exists) {
                return containerReply(interaction, errorPanel("Already Exists", `Ticket type with key \`${key}\` already exists.`), true);
            }

            try {
                await prisma.ticketType.create({
                    data: {
                        guildId: guild.id,
                        key,
                        displayName: name,
                        description,
                        categoryId: category?.id,
                        staffRoleIds: staffRole ? JSON.stringify([staffRole.id]) : "[]",
                        emoji,
                        panelType: "default",
                    },
                });
                return containerReply(interaction, successPanel("Ticket Type Created", `Created **${name}** (\`${key}\`)`), true);
            } catch (e) {
                return containerReply(interaction, errorPanel("Failed", String(e.message).slice(0, 200)), true);
            }
        }

        if (sub === "edit-type") {
            const key = interaction.options.getString("key");
            const type = await prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } });
            if (!type) {
                return containerReply(interaction, errorPanel("Not Found", `Ticket type \`${key}\` not found.`), true);
            }
            return containerReply(interaction, ticketTypeEditPanel(type, guild), true);
        }

        if (sub === "delete-type") {
            const key = interaction.options.getString("key");
            const type = await prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } });
            if (!type) {
                return containerReply(interaction, errorPanel("Not Found", `Ticket type \`${key}\` not found.`), true);
            }
            const openCount = await prisma.ticket.count({ where: { guildId: guild.id, typeId: type.id, status: { not: "CLOSED" } } }).catch(() => 0);
            if (openCount > 0) {
                return containerReply(interaction, errorPanel("Cannot Delete", `Type has ${openCount} open ticket(s). Close them first.`), true);
            }
            await prisma.ticketType.delete({ where: { guildId_key: { guildId: guild.id, key } } }).catch(() => {});
            return containerReply(interaction, successPanel("Deleted", `Ticket type \`${key}\` deleted.`), true);
        }

        if (sub === "panel") {
            const channel = interaction.options.getChannel("channel");
            const types = await prisma.ticketType.findMany({ where: { guildId: guild.id, enabled: true } });
            if (types.length === 0) {
                return containerReply(interaction, errorPanel("No Types", "No enabled ticket types to display. Create one first with `/tickets create-type`."), true);
            }
            const { createContainer, createActionRow, createSelectMenu, createSelectOption, divider, headerText, bodyText, mutedText, spacer } = await import("../../design/containers/base.js");
            const { Brand } = await import("../../design/theme.js");
            const options = types.map(t => createSelectOption(t.displayName, t.key, t.description, t.emoji));
            const container = createContainer([
                headerText("Support Tickets"),
                divider(),
                bodyText("Select a category below to create a ticket:"),
                divider(),
                createActionRow(createSelectMenu("ticket:create:select", "Choose ticket type...", options)),
                spacer(),
                mutedText(Brand.footer),
            ]);
            await channel.send({ components: [container] });
            return containerReply(interaction, successPanel("Panel Posted", `Ticket panel posted in <#${channel.id}>`), true);
        }

        if (sub === "list") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const statusFilter = interaction.options.getString("status") || "OPEN";
            const page = (interaction.options.getInteger("page") || 1) - 1;
            const where = { guildId: guild.id };
            if (statusFilter !== "ALL") where.status = statusFilter;
            const [rows, total] = await Promise.all([
                prisma.ticket.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, skip: page * 10 }).catch(() => []),
                prisma.ticket.count({ where }).catch(() => 0),
            ]);
            const typeIds = [...new Set(rows.map(r => r.typeId).filter(Boolean))];
            const types = typeIds.length ? await prisma.ticketType.findMany({ where: { id: { in: typeIds } } }).catch(() => []) : [];
            const typeMap = new Map(types.map(t => [t.id, t]));
            const enriched = rows.map(r => ({
                ...r,
                category: typeMap.get(r.typeId)?.displayName || r.panelType || "Ticket",
                shortId: r.id.slice(0, 4).toLowerCase(),
            }));
            const container = ticketListPanel(enriched, page, total);
            return interaction.editReply({ components: [container] }).catch(() => {});
        }

        if (sub === "stats") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const ticketService = interaction.client.services.tickets;
            const stats = await ticketService.getTicketStats(guild.id);
            const container = ticketStatsPanel(stats);
            return interaction.editReply({ components: [container] }).catch(() => {});
        }
    },
};
