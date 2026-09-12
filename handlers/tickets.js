import { MessageFlags, ChannelType, ButtonStyle } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { success, error, panel, stat } from "../ui/embeds.js";
import { button, selectMenu, row, modal } from "../ui/components.js";
import { Theme, Brand } from "../ui/theme.js";

async function getConfigView(client, guildId) {
    const prisma = client.services.prisma;
    const settings = await client.services.settings.get(guildId);
    const types = await prisma.ticketType.findMany({ where: { guildId } });
    const openCount = await prisma.ticket.count({ where: { guildId, status: { in: ["OPEN", "CLAIMED"] } } });
    const totalCount = await prisma.ticket.count({ where: { guildId } });

    const category = settings?.ticketCategoryId ? `<#${settings.ticketCategoryId}>` : "Not set";
    const logChannel = settings?.ticketLogChannelId ? `<#${settings.ticketLogChannelId}>` : "Not set";

    const typeList = types.length
        ? types.map(t => {
            const status = t.enabled ? "`ON`" : "`OFF`";
            const emoji = t.emoji || "🎫";
            const desc = t.description ? ` — ${t.description}` : "";
            return `${status} ${emoji} **${t.displayName}**${desc}`;
        }).join("\n")
        : "*No types configured yet*";

    return { category, logChannel, typeList, types, openCount, totalCount, settings };
}

function buildMainEmbed(data) {
    return new EmbedBuilder()
        .setColor(Theme.panel)
        .setTitle("Ticket Configuration")
        .setDescription(
            `**Category:** ${data.category}\n` +
            `**Log Channel:** ${data.logChannel}\n` +
            `**Open:** ${data.openCount} | **Total:** ${data.totalCount}\n\n` +
            `**Types:**\n${data.typeList}`
        )
        .setFooter({ text: Brand.footer })
        .setTimestamp();
}

function buildMainButtons() {
    return [
        row(
            button("Category", "ticket:cfg:category", ButtonStyle.Primary),
            button("Log Channel", "ticket:cfg:log", ButtonStyle.Primary),
        ),
        row(
            button("Types", "ticket:cfg:types", ButtonStyle.Success),
            button("Panel", "ticket:cfg:panel", ButtonStyle.Success),
        ),
        row(
            button("Settings", "ticket:cfg:settings", ButtonStyle.Secondary),
        ),
    ];
}

export default {
    // ═══════════════════════════════════════
    //  MAIN CONFIG
    // ═══════════════════════════════════════

    "ticket:cfg:category": async (i, client) => {
        const categories = i.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory)
            .map(c => ({ label: c.name, value: c.id }))
            .slice(0, 25);

        if (!categories.length) {
            return i.reply({ embeds: [error("No Categories", "Create a category channel first.")], flags: MessageFlags.Ephemeral });
        }

        const embed = panel("Set Ticket Category", "New tickets will be created inside this category:");
        const select = selectMenu("ticket:cfg:category:sel", "Choose a category", categories);
        await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:category:sel": async (i, client) => {
        const cat = i.guild.channels.cache.get(i.values[0]);
        await client.services.settings.patch(i.guild.id, { ticketCategoryId: i.values[0] });
        await i.update({ embeds: [success("Category Set", `Tickets will now be created in **${cat.name}**`)], components: [] });
    },

    "ticket:cfg:log": async (i, client) => {
        const channels = i.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ label: `#${c.name}`, value: c.id }))
            .slice(0, 25);

        if (!channels.length) {
            return i.reply({ embeds: [error("No Channels", "No text channels found.")], flags: MessageFlags.Ephemeral });
        }

        const embed = panel("Set Log Channel", "Ticket logs and transcripts will be sent here:");
        const select = selectMenu("ticket:cfg:log:sel", "Choose a channel", channels);
        await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:log:sel": async (i, client) => {
        await client.services.settings.patch(i.guild.id, { ticketLogChannelId: i.values[0] });
        await i.update({ embeds: [success("Log Channel Set", `Ticket logs will be sent to <#${i.values[0]}>`)], components: [] });
    },

    // ═══════════════════════════════════════
    //  TYPES MANAGEMENT
    // ═══════════════════════════════════════

    "ticket:cfg:types": async (i, client) => {
        const data = await getConfigView(client, i.guild.id);

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("Ticket Types")
            .setDescription(data.typeList)
            .setFooter({ text: "Click a type to edit it, or add a new one" })
            .setTimestamp();

        const components = [
            row(button("Add Type", "ticket:cfg:types:add", ButtonStyle.Success)),
        ];

        for (const t of data.types.slice(0, 5)) {
            const toggleLabel = t.enabled ? "Disable" : "Enable";
            const toggleStyle = t.enabled ? ButtonStyle.Secondary : ButtonStyle.Primary;
            components.push(row(
                button(`${t.emoji || "🎫"} ${t.displayName}`, `ticket:cfg:types:edit:${t.id}`, ButtonStyle.Secondary),
                button(toggleLabel, `ticket:cfg:types:toggle:${t.id}`, toggleStyle),
                button("Remove", `ticket:cfg:types:rm:${t.id}`, ButtonStyle.Danger),
            ));
        }

        components.push(row(button("Back", "ticket:cfg:back", ButtonStyle.Secondary)));
        await i.update({ embeds: [embed], components });
    },

    "ticket:cfg:types:add": async (i) => {
        const m = modal("Add Ticket Type", "ticket:cfg:types:add:submit", [
            { id: "name", label: "Display Name", required: true, placeholder: "e.g. General Support" },
            { id: "emoji", label: "Emoji", required: false, placeholder: "e.g. 🎫" },
            { id: "description", label: "Short Description", required: false, placeholder: "What this type is for" },
            { id: "channel_prefix", label: "Channel Prefix", required: false, value: "ticket" },
            { id: "welcome", label: "Welcome Message", required: false, placeholder: "Message shown when ticket opens" },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:add:submit": async (i, client) => {
        const name = i.fields.getTextInputValue("name");
        const emoji = i.fields.getTextInputValue("emoji") || null;
        const description = i.fields.getTextInputValue("description") || null;
        const channelPrefix = i.fields.getTextInputValue("channel_prefix") || "ticket";
        const welcomeMessage = i.fields.getTextInputValue("welcome") || null;

        await client.services.prisma.ticketType.create({
            data: {
                guildId: i.guild.id,
                key: name.toLowerCase().replace(/\s+/g, "-"),
                displayName: name,
                emoji,
                description,
                channelPrefix,
                panelType: "default",
                welcomeMessage,
            },
        });

        await i.reply({ embeds: [success("Type Added", `**${name}** created. Click it to edit advanced settings.`)], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:edit:": async (i, client) => {
        const typeId = i.customId.split(":")[4];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const staffRoles = JSON.parse(type.staffRoleIds || "[]");
        const questions = JSON.parse(type.questions || "[]");

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle(`${type.emoji || "🎫"} ${type.displayName}`)
            .setDescription(type.description || "*No description*")
            .addFields(
                stat("Status", type.enabled ? "Enabled" : "Disabled"),
                stat("Category", type.categoryId ? `<#${type.categoryId}>` : "Default"),
                stat("Channel Prefix", type.channelPrefix || "ticket"),
                stat("Cooldown", type.cooldown ? `${type.cooldown / 60_000}m` : "None"),
                stat("Max Open", type.maxOpen || "Unlimited"),
                stat("Staff Roles", staffRoles.length ? staffRoles.map(r => `<@&${r}>`).join(", ") : "None"),
                stat("Questions", questions.length || "None"),
                stat("Claim", type.allowClaim ? "On" : "Off"),
            )
            .setFooter({ text: "Edit any setting below" })
            .setTimestamp();

        const components = [
            row(
                button("Info", `ticket:cfg:types:modal:info:${typeId}`, ButtonStyle.Primary),
                button("Roles", `ticket:cfg:types:modal:roles:${typeId}`, ButtonStyle.Primary),
            ),
            row(
                button("Limits", `ticket:cfg:types:modal:limits:${typeId}`, ButtonStyle.Primary),
                button("Messages", `ticket:cfg:types:modal:msgs:${typeId}`, ButtonStyle.Primary),
            ),
            row(
                button("Toggle", `ticket:cfg:types:toggle:${typeId}`, type.enabled ? ButtonStyle.Secondary : ButtonStyle.Primary),
                button("Delete", `ticket:cfg:types:rm:${typeId}`, ButtonStyle.Danger),
            ),
            row(button("Back", "ticket:cfg:types", ButtonStyle.Secondary)),
        ];

        await i.update({ embeds: [embed], components });
    },

    "ticket:cfg:types:modal:info:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const m = modal("Edit Type Info", `ticket:cfg:types:sub:info:${typeId}`, [
            { id: "name", label: "Display Name", required: true, value: type.displayName },
            { id: "emoji", label: "Emoji", required: false, value: type.emoji || "" },
            { id: "description", label: "Description", required: false, value: type.description || "" },
            { id: "channel_prefix", label: "Channel Prefix", required: false, value: type.channelPrefix || "ticket" },
            { id: "category", label: "Category ID (optional)", required: false, value: type.categoryId || "" },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:sub:info:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        await client.services.prisma.ticketType.update({
            where: { id: typeId },
            data: {
                displayName: i.fields.getTextInputValue("name"),
                emoji: i.fields.getTextInputValue("emoji") || null,
                description: i.fields.getTextInputValue("description") || null,
                channelPrefix: i.fields.getTextInputValue("channel_prefix") || "ticket",
                categoryId: i.fields.getTextInputValue("category") || null,
            },
        });
        await i.reply({ embeds: [success("Updated", "Type info updated.")], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:modal:roles:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const staffRoles = JSON.parse(type.staffRoleIds || "[]");
        const modRoles = JSON.parse(type.moderatorRoleIds || "[]");

        const m = modal("Edit Roles", `ticket:cfg:types:sub:roles:${typeId}`, [
            { id: "staff_roles", label: "Staff Role IDs (comma-separated)", required: false, value: staffRoles.join(", ") },
            { id: "mod_roles", label: "Mod Role IDs (comma-separated)", required: false, value: modRoles.join(", ") },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:sub:roles:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const staffRaw = i.fields.getTextInputValue("staff_roles") || "";
        const modRaw = i.fields.getTextInputValue("mod_roles") || "";

        const staffRoles = staffRaw.split(",").map(s => s.trim()).filter(Boolean);
        const modRoles = modRaw.split(",").map(s => s.trim()).filter(Boolean);

        await client.services.prisma.ticketType.update({
            where: { id: typeId },
            data: {
                staffRoleIds: JSON.stringify(staffRoles),
                moderatorRoleIds: JSON.stringify(modRoles),
            },
        });
        await i.reply({ embeds: [success("Updated", "Roles updated.")], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:modal:limits:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const m = modal("Edit Limits", `ticket:cfg:types:sub:limits:${typeId}`, [
            { id: "max_open", label: "Max Open (0=unlimited)", required: false, value: String(type.maxOpen || 0) },
            { id: "cooldown", label: "Cooldown (minutes, 0=none)", required: false, value: String((type.cooldown || 0) / 60_000) },
            { id: "allow_claim", label: "Allow claiming? (yes/no)", required: false, value: type.allowClaim ? "yes" : "no" },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:sub:limits:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const maxOpen = parseInt(i.fields.getTextInputValue("max_open")) || 0;
        const cooldownMin = parseInt(i.fields.getTextInputValue("cooldown")) || 0;
        const allowClaim = i.fields.getTextInputValue("allow_claim").toLowerCase() === "yes";

        await client.services.prisma.ticketType.update({
            where: { id: typeId },
            data: {
                maxOpen: maxOpen || null,
                cooldown: cooldownMin ? cooldownMin * 60_000 : 0,
                allowClaim,
            },
        });
        await i.reply({ embeds: [success("Updated", "Limits updated.")], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:modal:msgs:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const m = modal("Edit Messages", `ticket:cfg:types:sub:msgs:${typeId}`, [
            { id: "welcome", label: "Welcome Message", required: false, value: type.welcomeMessage || "" },
            { id: "instructions", label: "Staff Instructions", required: false, value: type.instructions || "" },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:sub:msgs:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        await client.services.prisma.ticketType.update({
            where: { id: typeId },
            data: {
                welcomeMessage: i.fields.getTextInputValue("welcome") || null,
                instructions: i.fields.getTextInputValue("instructions") || null,
            },
        });
        await i.reply({ embeds: [success("Updated", "Messages updated.")], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:toggle:": async (i, client) => {
        const typeId = i.customId.split(":")[4];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        await client.services.prisma.ticketType.update({
            where: { id: typeId },
            data: { enabled: !type.enabled },
        });

        const status = type.enabled ? "disabled" : "enabled";
        await i.reply({ embeds: [success("Toggled", `**${type.displayName}** is now ${status}.`)], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:rm:": async (i, client) => {
        const typeId = i.customId.split(":")[4];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const embed = panel("Confirm Removal", `Remove **${type.displayName}**? This cannot be undone.`);
        const components = [
            row(
                button("Remove", `ticket:cfg:types:rm:confirm:${typeId}`, ButtonStyle.Danger),
                button("Cancel", "ticket:cfg:types:cancel", ButtonStyle.Secondary),
            ),
        ];
        await i.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:types:rm:confirm:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        await client.services.prisma.ticketType.delete({ where: { id: typeId } });
        await i.update({ embeds: [success("Removed", `**${type.displayName}** deleted.`)], components: [] });
    },

    "ticket:cfg:types:cancel": async (i) => {
        await i.update({ embeds: [panel("Cancelled", "No changes made.")], components: [] });
    },

    // ═══════════════════════════════════════
    //  PANEL
    // ═══════════════════════════════════════

    "ticket:cfg:panel": async (i, client) => {
        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("Panel Management")
            .setDescription("Deploy or update the ticket panel in a channel.")
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        const components = [
            row(button("Deploy Panel", "ticket:cfg:panel:deploy", ButtonStyle.Success)),
            row(button("Back", "ticket:cfg:back", ButtonStyle.Secondary)),
        ];

        await i.update({ embeds: [embed], components });
    },

    "ticket:cfg:panel:deploy": async (i, client) => {
        const channels = i.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => ({ label: `#${c.name}`, value: c.id }))
            .slice(0, 25);

        if (!channels.length) {
            return i.reply({ embeds: [error("No Channels", "No text channels found.")], flags: MessageFlags.Ephemeral });
        }

        const embed = panel("Deploy Panel", "Select a channel to send the ticket panel:");
        const select = selectMenu("ticket:cfg:panel:ch", "Choose a channel", channels);
        await i.reply({ embeds: [embed], components: [row(select)], flags: MessageFlags.Ephemeral });
    },

    "ticket:cfg:panel:ch": async (i, client) => {
        const channelId = i.values[0];
        const channel = i.guild.channels.cache.get(channelId);

        const types = await client.services.prisma.ticketType.findMany({
            where: { guildId: i.guild.id, enabled: true },
        });

        const embed = new EmbedBuilder()
            .setColor(Theme.ticket)
            .setTitle("🎫 Support Tickets")
            .setDescription("Need help? Click a button below to open a support ticket.")
            .setFooter({ text: Brand.footer })
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
        await i.update({ embeds: [success("Panel Deployed", `Ticket panel sent to <#${channelId}>`)], components: [] });
    },

    // ═══════════════════════════════════════
    //  SETTINGS
    // ═══════════════════════════════════════

    "ticket:cfg:settings": async (i, client) => {
        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("Ticket Settings")
            .setDescription("Global ticket settings that apply to all types.")
            .addFields(
                stat("Auto-close", "After 30 min of inactivity"),
                stat("Transcript", "Saved on close"),
                stat("Rating", "Shown after close"),
            )
            .setFooter({ text: "Future settings will appear here" })
            .setTimestamp();

        const components = [
            row(button("Back", "ticket:cfg:back", ButtonStyle.Secondary)),
        ];

        await i.update({ embeds: [embed], components });
    },

    // ═══════════════════════════════════════
    //  BACK TO MAIN
    // ═══════════════════════════════════════

    "ticket:cfg:back": async (i, client) => {
        const data = await getConfigView(client, i.guild.id);
        const embed = buildMainEmbed(data);
        const components = buildMainButtons();
        await i.update({ embeds: [embed], components });
    },

    // ═══════════════════════════════════════
    //  TICKET OPEN (from panel)
    // ═══════════════════════════════════════

    "ticket:open:": async (i, client) => {
        const typeId = i.customId.split(":")[2];
        const prisma = client.services.prisma;

        let type = null;
        if (typeId !== "default") {
            type = await prisma.ticketType.findUnique({ where: { id: typeId } });
        }

        if (type?.maxOpen) {
            const openCount = await prisma.ticket.count({
                where: { guildId: i.guild.id, typeId: type.id, status: { in: ["OPEN", "CLAIMED"] } },
            });
            if (openCount >= type.maxOpen) {
                return i.reply({ embeds: [error("Limit Reached", `Max **${type.maxOpen}** open tickets for this type.`)], flags: MessageFlags.Ephemeral });
            }
        }

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

        const existing = await prisma.ticket.findFirst({
            where: { guildId: i.guild.id, openerId: i.user.id, status: { in: ["OPEN", "CLAIMED"] } },
        });
        if (existing) {
            return i.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });
        }

        await i.deferReply({ flags: MessageFlags.Ephemeral });

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

        // Run triage analysis on type description + welcome message
        const triageInput = [type?.displayName, type?.description, welcome].filter(Boolean).join(" ");
        const triageResult = client.services.triage.analyze(triageInput, { guildId: i.guild.id, userId: i.user.id });
        client.services.triage.recordGuildStats(i.guild.id, triageResult.category, triageResult.urgency);

        const embed = new EmbedBuilder()
            .setColor(Theme.ticket)
            .setTitle(type?.displayName || "Support Ticket")
            .setDescription(welcome)
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        // Add triage info for staff (hidden from opener via separate staff embed)
        const urgencyEmoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
        const triageFields = [];
        triageFields.push({ name: "Category", value: triageResult.category, inline: true });
        triageFields.push({ name: "Urgency", value: `${urgencyEmoji[triageResult.urgency] || "⚪"} ${triageResult.urgency}`, inline: true });
        triageFields.push({ name: "Confidence", value: `${Math.round(triageResult.confidence * 100)}%`, inline: true });

        if (triageResult.suggestions.length > 0) {
            const suggText = triageResult.suggestions.map(s => `• ${s.text}`).join("\n");
            triageFields.push({ name: "Suggested Actions", value: suggText });
        }

        embed.addFields(...triageFields);

        if (type?.instructions) {
            embed.addFields({ name: "Staff Instructions", value: type.instructions });
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
        await i.editReply({ embeds: [success("Ticket Created", `<#${channel.id}> — ${type?.displayName || "Support"}`)] });
    },

    // ═══════════════════════════════════════
    //  RATING
    // ═══════════════════════════════════════

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
