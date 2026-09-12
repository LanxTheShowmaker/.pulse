import { MessageFlags, ChannelType, ButtonStyle } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { success, error, panel, stat } from "../design/embeds.js";
import { button, selectMenu, row, modal } from "../design/components.js";
import { Theme, Brand } from "../design/theme.js";

export default {
    // ── Config Panel Buttons ──

    "ticket:config:category": async (i, client) => {
        const categories = i.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory)
            .map(c => ({ label: c.name, value: c.id }))
            .slice(0, 25);

        if (!categories.length) {
            return i.reply({ embeds: [error("No Categories", "Create a category channel first.")], flags: MessageFlags.Ephemeral });
        }

        const embed = panel("Set Ticket Category", "Select a category for new tickets:");
        const select = selectMenu("ticket:config:category:select", "Choose a category", categories);
        await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
    },

    "ticket:config:category:select": async (i, client) => {
        const categoryId = i.values[0];
        const category = i.guild.channels.cache.get(categoryId);

        await client.services.settings.patch(i.guild.id, { ticketCategoryId: categoryId });
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
        await client.services.settings.patch(i.guild.id, { ticketLogChannelId: channelId });
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
            { id: "channel_prefix", label: "Channel Prefix", required: false, value: "ticket" },
            { id: "max_open", label: "Max Open (0=unlimited)", required: false, value: "0" },
        ]);
        await i.showModal(m);
    },

    "ticket:config:types:add:submit": async (i, client) => {
        const name = i.fields.getTextInputValue("name");
        const description = i.fields.getTextInputValue("description") || null;
        const emoji = i.fields.getTextInputValue("emoji") || null;
        const channelPrefix = i.fields.getTextInputValue("channel_prefix") || "ticket";
        const maxOpen = parseInt(i.fields.getTextInputValue("max_open")) || 0;

        await client.services.prisma.ticketType.create({
            data: {
                guildId: i.guild.id,
                key: name.toLowerCase().replace(/\s+/g, "-"),
                displayName: name,
                description,
                emoji,
                channelPrefix,
                panelType: "default",
                maxOpen: maxOpen || null,
            },
        });

        await i.reply({
            embeds: [success("Type Added", `**${name}** created successfully. Use edit to set cooldown and instructions.`)],
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
            { id: "cooldown", label: "Cooldown minutes (0=none)", required: false, value: String((type.cooldown || 0) / 60_000) },
            { id: "instructions", label: "Staff instructions", required: false, value: type.instructions || "" },
        ]);
        await i.showModal(m);
    },

    "ticket:config:types:editsub:": async (i, client) => {
        const typeId = i.customId.split(":")[4];
        const name = i.fields.getTextInputValue("name");
        const description = i.fields.getTextInputValue("description") || null;
        const emoji = i.fields.getTextInputValue("emoji") || null;
        const cooldownMin = parseInt(i.fields.getTextInputValue("cooldown")) || 0;
        const instructions = i.fields.getTextInputValue("instructions") || null;

        await client.services.prisma.ticketType.update({
            where: { id: typeId },
            data: { displayName: name, description, emoji, cooldown: cooldownMin ? cooldownMin * 60_000 : null, instructions },
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

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("🎫 Support Tickets")
            .setDescription("Need help? Click a button below to open a support ticket.")
            .setTimestamp();

        const components = [];

        if (types.length > 0) {
            const typeButtons = types.slice(0, 5).map(t =>
                button(`${t.emoji || "🎫"} ${t.displayName}`, `ticket:open:${t.id}`, ButtonStyle.Primary)
            );
            components.push(row(...typeButtons));
        } else {
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

        let type = null;
        if (typeId !== "default") {
            type = await prisma.ticketType.findUnique({ where: { id: typeId } });
        }

        // Check maxOpen per type
        if (type?.maxOpen) {
            const openCount = await prisma.ticket.count({
                where: { guildId: i.guild.id, typeId: type.id, status: { in: ["OPEN", "CLAIMED"] } },
            });
            if (openCount >= type.maxOpen) {
                return i.reply({ embeds: [error("Limit Reached", `Max **${type.maxOpen}** open tickets for this type.`)], flags: MessageFlags.Ephemeral });
            }
        }

        // Check cooldown per type
        if (type?.cooldown) {
            const lastClosed = await prisma.ticket.findFirst({
                where: { guildId: i.guild.id, openerId: i.user.id, typeId: type.id, status: "CLOSED" },
                orderBy: { closedAt: "desc" },
            });
            if (lastClosed?.closedAt) {
                const elapsed = Date.now() - lastClosed.closedAt.getTime();
                if (elapsed < type.cooldown) {
                    const remaining = Math.ceil((type.cooldown - elapsed) / 60_000);
                    return i.reply({ embeds: [error("Cooldown", `Wait **${remaining}m** before opening another ticket of this type.`)], flags: MessageFlags.Ephemeral });
                }
            }
        }

        // Check if user already has an open ticket
        const existing = await prisma.ticket.findFirst({
            where: { guildId: i.guild.id, openerId: i.user.id, status: { in: ["OPEN", "CLAIMED"] } },
        });
        if (existing) {
            return i.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });
        }

        await i.deferReply({ flags: MessageFlags.Ephemeral });

        // Use type category > saved config category > null
        const config = await client.services.settings.get(i.guild.id);
        const parentId = type?.categoryId || config.ticketCategoryId || null;

        const channel = await i.guild.channels.create({
            name: `${type?.channelPrefix || "ticket"}-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: parentId,
        });

        await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: false });
        await channel.permissionOverwrites.edit(i.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

        if (type?.staffRoleIds) {
            const staffIds = JSON.parse(type.staffRoleIds || "[]");
            for (const id of staffIds) {
                await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
            }
        }

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

        const welcome = type?.welcomeMessage || "A staff member will be with you shortly.";
        const embed = new EmbedBuilder()
            .setColor(Theme.ticket)
            .setTitle(type?.displayName || "Support Ticket")
            .setDescription(welcome)
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        if (type?.instructions) {
            embed.addFields({ name: "Staff Instructions", value: type.instructions });
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
        await i.editReply({
            embeds: [success("Ticket Created", `<#${channel.id}> — ${type?.displayName || "Support"}`)],
        });
    },

    // ── Rating Handler ──

    "ticketrate:": async (i, client) => {
        const parts = i.customId.split(":");
        const ticketId = parts[1];
        const rating = parseInt(parts[2]);
        if (!ticketId || isNaN(rating)) return i.reply({ embeds: [error("Error", "Invalid rating.")], flags: MessageFlags.Ephemeral }).catch(() => {});

        const ticket = await client.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) return i.reply({ embeds: [error("Error", "Ticket not found.")], flags: MessageFlags.Ephemeral }).catch(() => {});

        await client.services.tickets.rate(ticketId, ticket.channelId, ticket.guildId, i.user.id, rating);

        const stars = "⭐".repeat(rating);
        await i.reply({ embeds: [success("Thanks!", `You rated this ticket **${stars}** (${rating}/5)`)], flags: MessageFlags.Ephemeral }).catch(() => {});
    },
};
