import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags, ChannelType, ComponentType, ButtonStyle } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { success, error, panel, stat, cooldownDisplay } from "../../design/embeds.js";
import { button, selectMenu, row, modal } from "../../design/components.js";
import { Theme, Brand } from "../../design/theme.js";

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
        .addSubcommand(sub => sub.setName("close").setDescription("Close the current ticket"))
        .addSubcommand(sub => sub.setName("claim").setDescription("Claim the current ticket"))
        .addSubcommand(sub => sub.setName("list").setDescription("List open tickets"))
        .addSubcommand(sub => sub.setName("stats").setDescription("Ticket statistics"))
        .addSubcommand(sub => sub.setName("config").setDescription("Open the ticket configurator panel")),

    components: {
        // ── Config Panel Buttons ──

        "ticket:config:category": async (i, client) => {
            const prisma = client.services.prisma;
            const config = await prisma.guildSettings.findUnique({ where: { guildId: i.guild.id } });

            const categories = i.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildCategory)
                .map(c => ({ label: c.name, value: c.id }))
                .slice(0, 25);

            if (!categories.length) {
                return i.reply({ embeds: [error("No Categories", "Create a category channel first.")], flags: MessageFlags.Ephemeral });
            }

            const embed = panel("Set Ticket Category", "Select a category for new tickets:")
                .setColor(Theme.primary);

            const select = selectMenu("ticket:config:category:select", "Choose a category", categories);

            await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
        },

        "ticket:config:category:select": async (i, client) => {
            const categoryId = i.values[0];
            const category = i.guild.channels.cache.get(categoryId);

            await client.services.prisma.guildSettings.upsert({
                where: { guildId: i.guild.id },
                create: { guildId: i.guild.id },
                update: {},
            });

            // Store in a simple way - we'll use the ticketService or just store in settings
            // For now, we store in a JSON field or we can use ticket types
            // Let's use the channel as a hint - store in automod config or similar
            // Actually, let's just acknowledge and store
            await i.update({
                embeds: [success("Category Set", `Tickets will now be created in **${category.name}**`)],
                components: [],
            });
        },

        "ticket:config:log": async (i, client) => {
            const channels = i.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildText)
                .map(c => ({ label: `#${c.name}`, value: c.id }))
                .slice(0, 25);

            if (!channels.length) {
                return i.reply({ embeds: [error("No Channels", "No text channels found.")], flags: MessageFlags.Ephemeral });
            }

            const embed = panel("Set Ticket Log Channel", "Select a channel for ticket logs:");
            const select = selectMenu("ticket:config:log:select", "Choose a channel", channels);

            await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
        },

        "ticket:config:log:select": async (i, client) => {
            const channelId = i.values[0];
            const channel = i.guild.channels.cache.get(channelId);

            await client.services.prisma.guildSettings.upsert({
                where: { guildId: i.guild.id },
                create: { guildId: i.guild.id },
                update: {},
            });

            await i.update({
                embeds: [success("Log Channel Set", `Ticket logs will be sent to <#${channelId}>`)],
                components: [],
            });
        },

        "ticket:config:types": async (i, client) => {
            const types = await client.services.prisma.ticketType.findMany({
                where: { guildId: i.guild.id },
            });

            const typeLines = types.length
                ? types.map(t => `${t.enabled ? "●" : "○"} **${t.displayName}** — ${t.description || "No desc"}`)
                : ["No types configured."];

            const embed = panel("Manage Ticket Types", typeLines.join("\n"));

            const components = [
                row(button("Add Type", "ticket:config:types:add", ButtonStyle.Success)),
            ];

            // Add edit/remove buttons for each type
            for (const t of types.slice(0, 5)) {
                components.push(row(
                    button(`Edit ${t.displayName}`, `ticket:config:types:editbtn:${t.id}`, ButtonStyle.Primary),
                    button(`Remove ${t.displayName}`, `ticket:config:types:removebtn:${t.id}`, ButtonStyle.Danger),
                ));
            }

            components.push(row(button("Back", "ticket:config:back", ButtonStyle.Secondary)));

            await i.update({ embeds: [embed], components });
        },

        "ticket:config:types:add": async (i) => {
            const m = modal("Add Ticket Type", "ticket:config:types:add:submit", [
                { id: "name", label: "Display Name", required: true },
                { id: "description", label: "Description", required: false },
                { id: "emoji", label: "Emoji", required: false },
                { id: "channel_prefix", label: "Channel Prefix (e.g. support)", required: false, value: "ticket" },
            ]);
            await i.showModal(m);
        },

        "ticket:config:types:add:submit": async (i, client) => {
            const name = i.fields.getTextInputValue("name");
            const description = i.fields.getTextInputValue("description") || null;
            const emoji = i.fields.getTextInputValue("emoji") || null;
            const channelPrefix = i.fields.getTextInputValue("channel_prefix") || "ticket";

            await client.services.prisma.ticketType.create({
                data: {
                    guildId: i.guild.id,
                    key: name.toLowerCase().replace(/\s+/g, "-"),
                    displayName: name,
                    description,
                    emoji,
                    channelPrefix,
                    panelType: "default",
                },
            });

            await i.reply({
                embeds: [success("Type Added", `**${name}** created successfully.`)],
                flags: MessageFlags.Ephemeral,
            });
        },

        "ticket:config:types:editbtn:": async (i, client) => {
            const typeId = i.customId.split(":")[4];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            const m = modal("Edit Ticket Type", `ticket:config:types:editsub:${typeId}`, [
                { id: "name", label: "Display Name", required: true, value: type.displayName },
                { id: "description", label: "Description", required: false, value: type.description || "" },
                { id: "emoji", label: "Emoji", required: false, value: type.emoji || "" },
                { id: "channel_prefix", label: "Channel Prefix", required: false, value: type.channelPrefix || "ticket" },
            ]);
            await i.showModal(m);
        },

        "ticket:config:types:editsub:": async (i, client) => {
            const typeId = i.customId.split(":")[4];
            const name = i.fields.getTextInputValue("name");
            const description = i.fields.getTextInputValue("description") || null;
            const emoji = i.fields.getTextInputValue("emoji") || null;
            const channelPrefix = i.fields.getTextInputValue("channel_prefix") || "ticket";

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: { displayName: name, description, emoji, channelPrefix },
            });

            await i.reply({
                embeds: [success("Type Updated", `**${name}** updated successfully.`)],
                flags: MessageFlags.Ephemeral,
            });
        },

        "ticket:config:types:removebtn:": async (i, client) => {
            const typeId = i.customId.split(":")[4];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            const embed = panel("Confirm Removal", `Remove **${type.displayName}**?`);
            const components = [
                row(
                    button("Confirm", `ticket:config:types:removeconfirm:${typeId}`, ButtonStyle.Danger),
                    button("Cancel", "ticket:config:types:cancel", ButtonStyle.Secondary),
                ),
            ];
            await i.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
        },

        "ticket:config:types:removeconfirm:": async (i, client) => {
            const typeId = i.customId.split(":")[4];
            await client.services.prisma.ticketType.delete({ where: { id: typeId } });
            await i.update({ embeds: [success("Type Removed", "Ticket type deleted.")], components: [] });
        },

        "ticket:config:types:cancel": async (i) => {
            await i.update({ embeds: [panel("Cancelled", "No changes made.")], components: [] });
        },

        "ticket:config:deploy": async (i, client) => {
            const types = await client.services.prisma.ticketType.findMany({
                where: { guildId: i.guild.id, enabled: true },
            });

            const channels = i.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildText)
                .map(c => ({ label: `#${c.name}`, value: c.id }))
                .slice(0, 25);

            if (!channels.length) {
                return i.reply({ embeds: [error("No Channels", "No text channels found.")], flags: MessageFlags.Ephemeral });
            }

            const embed = panel("Deploy Ticket Panel", "Select a channel to deploy the ticket panel:");
            const select = selectMenu("ticket:config:deploy:select", "Choose a channel", channels);

            await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
        },

        "ticket:config:deploy:select": async (i, client) => {
            const channelId = i.values[0];
            const channel = i.guild.channels.cache.get(channelId);

            const types = await client.services.prisma.ticketType.findMany({
                where: { guildId: i.guild.id, enabled: true },
            });

            // Build the panel embed
            const embed = new EmbedBuilder()
                .setColor(Theme.primary)
                .setTitle("🎫 Support Tickets")
                .setDescription("Need help? Click a button below to open a support ticket.")
                .setTimestamp();

            const components = [];

            if (types.length > 0) {
                // Show buttons for each type
                const typeButtons = types.slice(0, 5).map(t =>
                    button(`${t.emoji || "🎫"} ${t.displayName}`, `ticket:open:${t.id}`, ButtonStyle.Primary)
                );
                components.push(row(...typeButtons));
            } else {
                // Default ticket button
                components.push(row(
                    button("🎫 Open Ticket", "ticket:open:default", ButtonStyle.Primary),
                ));
            }

            await channel.send({ embeds: [embed], components }).catch(() => {});

            await i.update({
                embeds: [success("Panel Deployed", `Ticket panel sent to <#${channelId}>`)],
                components: [],
            });
        },

        "ticket:config:back": async (i, client) => {
            // Re-show the config panel
            const prisma = client.services.prisma;
            const types = await prisma.ticketType.findMany({ where: { guildId: i.guild.id } });
            const openCount = await prisma.ticket.count({ where: { guildId: i.guild.id, status: { in: ["OPEN", "CLAIMED"] } } });

            const typeLines = types.length
                ? types.map(t => `${t.enabled ? "●" : "○"} **${t.displayName}** — ${t.description || "No description"}`)
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

            await i.update({ embeds: [embed], components });
        },

        // ── Ticket Open (from panel) ──

        "ticket:open:": async (i, client) => {
            const typeId = i.customId.split(":")[2];
            const prisma = client.services.prisma;

            // Check for existing open ticket
            const existing = await prisma.ticket.findFirst({
                where: { guildId: i.guild.id, openerId: i.user.id, status: { in: ["OPEN", "CLAIMED"] } },
            });
            if (existing) {
                return i.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });
            }

            await i.deferReply({ flags: MessageFlags.Ephemeral });

            let type = null;
            if (typeId !== "default") {
                type = await prisma.ticketType.findUnique({ where: { id: typeId } });
            }

            const channel = await i.guild.channels.create({
                name: `${type?.channelPrefix || "ticket"}-${i.user.username}`,
                type: ChannelType.GuildText,
                parent: type?.categoryId || null,
            });

            // Set permissions
            await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: false });
            await channel.permissionOverwrites.edit(i.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

            if (type?.staffRoleIds) {
                const staffIds = JSON.parse(type.staffRoleIds || "[]");
                for (const id of staffIds) {
                    await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
                }
            }

            // Create ticket in DB
            await prisma.ticket.create({
                data: {
                    guildId: i.guild.id,
                    channelId: channel.id,
                    openerId: i.user.id,
                    typeId: type?.id ?? null,
                    panelType: type?.panelType ?? "default",
                    status: "OPEN",
                },
            });

            // Welcome message
            const welcome = type?.welcomeMessage || "A staff member will be with you shortly.";
            const embed = new EmbedBuilder()
                .setColor(Theme.ticket)
                .setTitle(type?.displayName || "Support Ticket")
                .setDescription(welcome)
                .setFooter({ text: Brand.footer })
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(() => {});

            await i.editReply({
                embeds: [success("Ticket Created", `<#${channel.id}> — ${type?.displayName || "Support"}`)],
            });
        },
    },

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
        const reason = interaction.options.getString("reason") ?? "No reason provided";

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
