import { MessageFlags, ChannelType, ButtonStyle, PermissionFlagsBits, TextInputStyle } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { success, error, panel, stat } from "../ui/embeds.js";
import { button, selectMenu, row, modal } from "../ui/components.js";
import { Theme, Brand } from "../ui/theme.js";

// ─── HELPERS ──────────────────────────────────────────────

async function getConfigView(client, guildId) {
    const prisma = client.services.prisma;
    const settings = await client.services.settings.get(guildId);
    const types = await prisma.ticketType.findMany({ where: { guildId } });
    const openCount = await prisma.ticket.count({ where: { guildId, status: { notIn: ["CLOSED"] } } });
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

function buildWorkspaceEmbed(ticket, type) {
    const priorityEmoji = { LOW: "🟢", NORMAL: "⚪", HIGH: "🟠", URGENT: "🔴" };
    const statusEmoji = { OPEN: "📨", CLAIMED: "👤", IN_PROGRESS: "🔧", WAITING: "⏳", RESOLVED: "✅", CLOSED: "🔒" };

    const embed = new EmbedBuilder()
        .setColor(Theme.ticket)
        .setTitle(`${statusEmoji[ticket.status] || "🎫"} Ticket #${ticket.id.slice(0, 8)}`)
        .addFields(
            stat("Status", `${statusEmoji[ticket.status] || ""} ${ticket.status}`),
            stat("Priority", `${priorityEmoji[ticket.priority] || ""} ${ticket.priority}`),
            stat("Type", type?.displayName || "General"),
            stat("Opened by", `<@${ticket.openerId}>`),
            stat("Created", `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`),
        )
        .setFooter({ text: Brand.footer })
        .setTimestamp();

    if (ticket.claimedById) embed.addFields(stat("Claimed by", `<@${ticket.claimedById}>`));
    if (ticket.assignedById && ticket.assignedById !== ticket.claimedById) {
        embed.addFields(stat("Assigned to", `<@${ticket.assignedById}>`));
    }
    if (type?.instructions) embed.addFields({ name: "Staff Instructions", value: type.instructions, inline: false });

    return embed;
}

function buildWorkspaceButtons(ticket) {
    const canClaim = ["OPEN", "WAITING"].includes(ticket.status);
    const canStatus = !["CLOSED"].includes(ticket.status);
    const canClose = !["CLOSED"].includes(ticket.status);

    return [
        row(
            button("Claim", `ticket:ws:claim:${ticket.id}`, ButtonStyle.Success, !canClaim),
            button("Close", `ticket:ws:close:${ticket.id}`, ButtonStyle.Danger, !canClose),
        ),
        row(
            button("Status", `ticket:ws:status:${ticket.id}`, ButtonStyle.Primary, !canStatus),
            button("Priority", `ticket:ws:priority:${ticket.id}`, ButtonStyle.Primary),
            button("Note", `ticket:ws:note:${ticket.id}`, ButtonStyle.Secondary),
        ),
        row(
            button("Add User", `ticket:ws:adduser:${ticket.id}`, ButtonStyle.Secondary),
            button("Remove User", `ticket:ws:rmuser:${ticket.id}`, ButtonStyle.Secondary),
            button("Transcript", `ticket:ws:transcript:${ticket.id}`, ButtonStyle.Secondary),
        ),
    ];
}

function buildPanelEmbed(types) {
    const embed = new EmbedBuilder()
        .setColor(Theme.ticket)
        .setTitle("🎫 Support Tickets")
        .setDescription("Need help? Select a request type below to open a support ticket.")
        .setFooter({ text: Brand.footer })
        .setTimestamp();

    if (types.length > 5) {
        const options = types.map(t => ({
            label: t.displayName,
            value: t.id,
            description: t.description || undefined,
            emoji: t.emoji || undefined,
        }));
        return { embed, components: [row(selectMenu("ticket:open:select", "Select a ticket type", options))] };
    }

    const buttons = types.map(t =>
        button(`${t.emoji || "🎫"} ${t.displayName}`, `ticket:open:${t.id}`, ButtonStyle.Primary)
    );

    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
        components.push(row(...buttons.slice(i, i + 5)));
    }

    return { embed, components };
}

function safeInt(val, fallback) {
    const n = parseInt(val);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ─── HANDLERS ─────────────────────────────────────────────

export default {

    // ═══════════════════════════════════════
    //  CONFIG: CATEGORY
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
        await i.update({ embeds: [success("Category Set", `Tickets will now be created in **${cat?.name ?? "unknown"}**`)], components: [] });
    },

    // ═══════════════════════════════════════
    //  CONFIG: LOG CHANNEL
    // ═══════════════════════════════════════

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
    //  CONFIG: TYPES LIST
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

    // ═══════════════════════════════════════
    //  CONFIG: ADD TYPE
    // ═══════════════════════════════════════

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
        try {
            const name = (i.components.getTextInputValue("name") || "").trim();
            if (!name) {
                return i.reply({ embeds: [error("Invalid", "Display name is required.")], flags: MessageFlags.Ephemeral });
            }

            const emoji = (i.components.getTextInputValue("emoji") || "").trim() || null;
            const description = (i.components.getTextInputValue("description") || "").trim() || null;
            const channelPrefix = (i.components.getTextInputValue("channel_prefix") || "").trim() || "ticket";
            const welcomeMessage = (i.components.getTextInputValue("welcome") || "").trim() || null;

            const key = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
            if (!key) {
                return i.reply({ embeds: [error("Invalid", "Name must contain at least one letter or number.")], flags: MessageFlags.Ephemeral });
            }

            const existing = await client.services.prisma.ticketType.findFirst({
                where: { guildId: i.guild.id, key },
            });
            if (existing) {
                return i.reply({ embeds: [error("Duplicate", "A type with this name already exists.")], flags: MessageFlags.Ephemeral });
            }

            await client.services.prisma.ticketType.create({
                data: {
                    guildId: i.guild.id,
                    key,
                    displayName: name,
                    emoji,
                    description,
                    channelPrefix,
                    panelType: "default",
                    welcomeMessage,
                },
            });

            await i.reply({ embeds: [success("Type Added", `**${name}** created. Click it to edit advanced settings.`)], flags: MessageFlags.Ephemeral });
        } catch (e) {
            const msg = e.message || "Unknown error";
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", `Could not create type: ${msg}`)], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  CONFIG: EDIT TYPE
    // ═══════════════════════════════════════

    "ticket:cfg:types:edit:": async (i, client) => {
        const typeId = i.customId.split(":")[4];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const staffRoles = JSON.parse(type.staffRoleIds || "[]");
        const formQuestions = JSON.parse(type.formQuestions || "[]");

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle(`${type.emoji || "🎫"} ${type.displayName}`)
            .setDescription(type.description || "*No description*")
            .addFields(
                stat("Status", type.enabled ? "Enabled" : "Disabled"),
                stat("Category", type.categoryId ? `<#${type.categoryId}>` : "Default"),
                stat("Channel Prefix", type.channelPrefix || "ticket"),
                stat("Cooldown", type.cooldown ? `${type.cooldown / 60_000}m` : "None"),
                stat("Max Open", type.maxOpen === 0 ? "Unlimited" : String(type.maxOpen)),
                stat("Staff Roles", staffRoles.length ? staffRoles.map(r => `<@&${r}>`).join(", ") : "None"),
                stat("Form Questions", formQuestions.length ? String(formQuestions.length) : "None"),
                stat("Auto-Close", `${type.autoCloseMinutes || 30}m`),
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
                button("Form", `ticket:cfg:types:form:${typeId}`, ButtonStyle.Primary),
                button("Toggle", `ticket:cfg:types:toggle:${typeId}`, type.enabled ? ButtonStyle.Secondary : ButtonStyle.Primary),
                button("Delete", `ticket:cfg:types:rm:${typeId}`, ButtonStyle.Danger),
            ),
            row(button("Back", "ticket:cfg:types", ButtonStyle.Secondary)),
        ];

        await i.update({ embeds: [embed], components });
    },

    // ─── EDIT: INFO ───────────────────────────

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
        try {
            const typeId = i.customId.split(":")[5];
            const name = (i.components.getTextInputValue("name") || "").trim();
            if (!name) {
                return i.reply({ embeds: [error("Invalid", "Display name is required.")], flags: MessageFlags.Ephemeral });
            }

            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: {
                    displayName: name,
                    emoji: (i.components.getTextInputValue("emoji") || "").trim() || null,
                    description: (i.components.getTextInputValue("description") || "").trim() || null,
                    channelPrefix: (i.components.getTextInputValue("channel_prefix") || "").trim() || "ticket",
                    categoryId: (i.components.getTextInputValue("category") || "").trim() || null,
                },
            });
            await i.reply({ embeds: [success("Updated", "Type info updated.")], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Update failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ─── EDIT: ROLES ─────────────────────────

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
        try {
            const typeId = i.customId.split(":")[5];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            const staffRaw = i.components.getTextInputValue("staff_roles") || "";
            const modRaw = i.components.getTextInputValue("mod_roles") || "";

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
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Update failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ─── EDIT: LIMITS ────────────────────────

    "ticket:cfg:types:modal:limits:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const m = modal("Edit Limits", `ticket:cfg:types:sub:limits:${typeId}`, [
            { id: "max_open", label: "Max Open (0=unlimited)", required: false, value: String(type.maxOpen) },
            { id: "cooldown", label: "Cooldown (minutes, 0=none)", required: false, value: String(Math.round((type.cooldown || 0) / 60_000)) },
            { id: "auto_close", label: "Auto-close (minutes, 0=off)", required: false, value: String(type.autoCloseMinutes || 30) },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:sub:limits:": async (i, client) => {
        try {
            const typeId = i.customId.split(":")[5];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            const maxOpen = safeInt(i.components.getTextInputValue("max_open"), 0);
            const cooldownMin = safeInt(i.components.getTextInputValue("cooldown"), 0);
            const autoCloseMin = safeInt(i.components.getTextInputValue("auto_close"), 30);

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: {
                    maxOpen,
                    cooldown: cooldownMin * 60_000,
                    autoCloseMinutes: autoCloseMin,
                },
            });
            await i.reply({ embeds: [success("Updated", "Limits updated.")], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Update failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ─── EDIT: MESSAGES ──────────────────────

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
        try {
            const typeId = i.customId.split(":")[5];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: {
                    welcomeMessage: (i.components.getTextInputValue("welcome") || "").trim() || null,
                    instructions: (i.components.getTextInputValue("instructions") || "").trim() || null,
                },
            });
            await i.reply({ embeds: [success("Updated", "Messages updated.")], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Update failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ─── EDIT: FORM ──────────────────────────

    "ticket:cfg:types:form:": async (i, client) => {
        const typeId = i.customId.split(":")[4];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const questions = JSON.parse(type.formQuestions || "[]");
        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle(`Form: ${type.displayName}`)
            .setDescription(
                questions.length
                    ? questions.map((q, idx) => `**${idx + 1}.** ${q.label} (${q.style || "short"}${q.required ? ", required" : ""})`).join("\n")
                    : "*No form questions configured.*"
            )
            .setFooter({ text: "Discord modals support up to 5 questions" })
            .setTimestamp();

        const components = [
            row(button("Edit Form", `ticket:cfg:types:modal:form:${typeId}`, ButtonStyle.Primary)),
        ];
        if (questions.length > 0) {
            components.push(row(
                button("Clear Form", `ticket:cfg:types:form:clear:${typeId}`, ButtonStyle.Danger),
            ));
        }
        components.push(row(button("Back", `ticket:cfg:types:edit:${typeId}`, ButtonStyle.Secondary)));

        await i.update({ embeds: [embed], components });
    },

    "ticket:cfg:types:modal:form:": async (i, client) => {
        const typeId = i.customId.split(":")[5];
        const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
        if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

        const questions = JSON.parse(type.formQuestions || "[]");
        const q1 = questions[0];
        const q2 = questions[1];
        const q3 = questions[2];

        const m = modal("Edit Form Questions", `ticket:cfg:types:sub:form:${typeId}`, [
            { id: "q1", label: "Question 1 (blank to remove)", required: false, value: q1?.label || "", placeholder: "e.g. What do you need?", style: TextInputStyle.Paragraph },
            { id: "q1_req", label: "Q1 Required? (yes/no)", required: false, value: q1?.required ? "yes" : "no" },
            { id: "q2", label: "Question 2 (blank to remove)", required: false, value: q2?.label || "", placeholder: "e.g. Describe your request" },
            { id: "q2_req", label: "Q2 Required? (yes/no)", required: false, value: q2?.required ? "yes" : "no" },
            { id: "q3", label: "Question 3 (blank to remove)", required: false, value: q3?.label || "", placeholder: "e.g. Deadline?" },
        ]);
        await i.showModal(m);
    },

    "ticket:cfg:types:sub:form:": async (i, client) => {
        try {
            const typeId = i.customId.split(":")[5];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            const questions = [];
            const q1Label = (i.components.getTextInputValue("q1") || "").trim();
            const q2Label = (i.components.getTextInputValue("q2") || "").trim();
            const q3Label = (i.components.getTextInputValue("q3") || "").trim();
            const q1Req = (i.components.getTextInputValue("q1_req") || "").toLowerCase() === "yes";
            const q2Req = (i.components.getTextInputValue("q2_req") || "").toLowerCase() === "yes";

            if (q1Label) questions.push({ id: "q1", label: q1Label, style: "paragraph", required: q1Req });
            if (q2Label) questions.push({ id: "q2", label: q2Label, style: "short", required: q2Req });
            if (q3Label) questions.push({ id: "q3", label: q3Label, style: "short", required: false });

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: { formQuestions: JSON.stringify(questions) },
            });

            const count = questions.length;
            await i.reply({ embeds: [success("Form Updated", `${count} question${count !== 1 ? "s" : ""} configured.`)], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Update failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    "ticket:cfg:types:form:clear:": async (i, client) => {
        try {
            const typeId = i.customId.split(":")[5];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: { formQuestions: "[]" },
            });
            await i.reply({ embeds: [success("Form Cleared", "All form questions removed.")], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Update failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ─── TOGGLE / DELETE ─────────────────────

    "ticket:cfg:types:toggle:": async (i, client) => {
        try {
            const typeId = i.customId.split(":")[4];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.reply({ embeds: [error("Not Found", "Type not found.")], flags: MessageFlags.Ephemeral });

            await client.services.prisma.ticketType.update({
                where: { id: typeId },
                data: { enabled: !type.enabled },
            });

            const status = type.enabled ? "disabled" : "enabled";
            await i.reply({ embeds: [success("Toggled", `**${type.displayName}** is now ${status}.`)], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Toggle failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
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
        try {
            const typeId = i.customId.split(":")[5];
            const type = await client.services.prisma.ticketType.findUnique({ where: { id: typeId } });
            if (!type) return i.update({ embeds: [error("Not Found", "Type not found.")], components: [] });

            await client.services.prisma.ticketType.delete({ where: { id: typeId } });
            await i.update({ embeds: [success("Removed", `**${type.displayName}** deleted.`)], components: [] });
        } catch (e) {
            await i.update({ embeds: [error("Failed", e.message || "Delete failed")], components: [] }).catch(() => {});
        }
    },

    "ticket:cfg:types:cancel": async (i) => {
        await i.update({ embeds: [panel("Cancelled", "No changes made.")], components: [] });
    },

    // ═══════════════════════════════════════
    //  CONFIG: PANEL
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
        try {
            const channelId = i.values[0];
            const channel = i.guild.channels.cache.get(channelId);

            const types = await client.services.prisma.ticketType.findMany({
                where: { guildId: i.guild.id, enabled: true },
            });

            if (!types.length) {
                return i.update({ embeds: [error("No Types", "Create and enable at least one ticket type first.")], components: [] });
            }

            const { embed, components } = buildPanelEmbed(types);

            await channel.send({ embeds: [embed], components }).catch(() => {});
            await i.update({ embeds: [success("Panel Deployed", `Ticket panel sent to <#${channelId}>`)], components: [] });
        } catch (e) {
            await i.update({ embeds: [error("Failed", e.message || "Deploy failed")], components: [] }).catch(() => {});
        }
    },

    // ═══════════════════════════════════════
    //  CONFIG: SETTINGS
    // ═══════════════════════════════════════

    "ticket:cfg:settings": async (i, client) => {
        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("Ticket Settings")
            .setDescription("Global ticket settings that apply to all types.")
            .addFields(
                stat("Transcript", "Saved on close"),
                stat("Rating", "Shown after close"),
                stat("Auto-Close", "Configurable per type (default 30m)"),
            )
            .setFooter({ text: "Settings are configured per-type" })
            .setTimestamp();

        const components = [
            row(button("Back", "ticket:cfg:back", ButtonStyle.Secondary)),
        ];

        await i.update({ embeds: [embed], components });
    },

    // ═══════════════════════════════════════
    //  CONFIG: BACK
    // ═══════════════════════════════════════

    "ticket:cfg:back": async (i, client) => {
        const data = await getConfigView(client, i.guild.id);
        const embed = buildMainEmbed(data);
        const components = buildMainButtons();
        await i.update({ embeds: [embed], components });
    },

    // ═══════════════════════════════════════
    //  TICKET OPEN: BUTTON (per type)
    // ═══════════════════════════════════════

    "ticket:open:": async (i, client) => {
        try {
            const typeId = i.customId.split(":")[2];
            const prisma = client.services.prisma;
            const tickets = client.services.tickets;

            let type = null;
            if (typeId !== "default") {
                type = await prisma.ticketType.findUnique({ where: { id: typeId } });
            }

            // Limits check
            if (type?.maxOpen && type.maxOpen > 0) {
                const openCount = await tickets.countOpenByType(i.guild.id, type.id);
                if (openCount >= type.maxOpen) {
                    return i.reply({ embeds: [error("Limit Reached", `Max **${type.maxOpen}** open tickets for this type.`)], flags: MessageFlags.Ephemeral });
                }
            }

            // Cooldown check
            if (type?.cooldown && type.cooldown > 0) {
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

            // Existing ticket check
            const existing = await tickets.getOpenByUser(i.guild.id, i.user.id);
            if (existing) {
                return i.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });
            }

            // Check if type has form questions
            const formQuestions = type ? JSON.parse(type.formQuestions || "[]") : [];
            if (formQuestions.length > 0) {
                const inputs = formQuestions.slice(0, 5).map(q => ({
                    id: q.id,
                    label: q.label.slice(0, 45),
                    required: q.required ?? true,
                    style: q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short,
                    placeholder: (q.placeholder || "").slice(0, 100),
                }));
                const m = modal(`${type.displayName} — Form`, `ticket:open:form:${typeId}`, inputs);
                return i.showModal(m);
            }

            // No form — create ticket directly
            await i.deferReply({ flags: MessageFlags.Ephemeral });

            const config = await client.services.settings.get(i.guild.id);
            const parentId = type?.categoryId || config?.ticketCategoryId || null;

            const channel = await i.guild.channels.create({
                name: `${type?.channelPrefix || "ticket"}-${i.user.username}`.slice(0, 100),
                type: ChannelType.GuildText,
                parent: parentId,
            }).catch(e => {
                throw new Error(`Could not create channel: ${e.message}`);
            });

            await tickets.applyPermissions(channel, i.guild, i.user, type);
            const ticket = await tickets.create(i.guild, channel, i.user, type);

            const welcome = type?.welcomeMessage || "A staff member will be with you shortly.";

            const embed = new EmbedBuilder()
                .setColor(Theme.ticket)
                .setTitle(type?.displayName || "Support Ticket")
                .setDescription(welcome)
                .addFields(stat("Ticket", `#${ticket.id.slice(0, 8)}`))
                .setFooter({ text: Brand.footer })
                .setTimestamp();

            if (type?.instructions) {
                embed.addFields({ name: "Staff Instructions", value: type.instructions, inline: false });
            }

            const workspaceEmbed = buildWorkspaceEmbed(ticket, type);
            const workspaceButtons = buildWorkspaceButtons(ticket);

            await channel.send({ embeds: [embed] }).catch(() => {});
            await channel.send({ embeds: [workspaceEmbed], components: workspaceButtons }).catch(() => {});

            if (config?.ticketLogChannelId) {
                const logCh = i.guild.channels.cache.get(config.ticketLogChannelId);
                if (logCh?.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(Theme.info)
                        .setTitle("Ticket Opened")
                        .setDescription(`<@${i.user.id}> opened **${type?.displayName || "General"}** in <#${channel.id}>`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await logCh.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            await i.editReply({ embeds: [success("Ticket Created", `<#${channel.id}> — ${type?.displayName || "Support"}`)] });
        } catch (e) {
            if (i.deferred) {
                await i.editReply({ embeds: [error("Failed", e.message || "Could not create ticket")] }).catch(() => {});
            } else if (!i.replied) {
                await i.reply({ embeds: [error("Failed", e.message || "Could not create ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET OPEN: FORM SUBMIT
    // ═══════════════════════════════════════

    "ticket:open:form:": async (i, client) => {
        try {
            const typeId = i.customId.split(":")[3];
            const prisma = client.services.prisma;
            const tickets = client.services.tickets;

            let type = null;
            if (typeId !== "default") {
                type = await prisma.ticketType.findUnique({ where: { id: typeId } });
            }

            // Collect form answers
            const formQuestions = type ? JSON.parse(type.formQuestions || "[]") : [];
            const answers = {};
            for (const q of formQuestions.slice(0, 5)) {
                try {
                    answers[q.id] = i.components.getTextInputValue(q.id);
                } catch {
                    answers[q.id] = "";
                }
            }

            // Duplicate check
            const existing = await tickets.getOpenByUser(i.guild.id, i.user.id);
            if (existing) {
                return i.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });
            }

            await i.deferReply({ flags: MessageFlags.Ephemeral });

            const config = await client.services.settings.get(i.guild.id);
            const parentId = type?.categoryId || config?.ticketCategoryId || null;

            const channel = await i.guild.channels.create({
                name: `${type?.channelPrefix || "ticket"}-${i.user.username}`.slice(0, 100),
                type: ChannelType.GuildText,
                parent: parentId,
            }).catch(e => {
                throw new Error(`Could not create channel: ${e.message}`);
            });

            await tickets.applyPermissions(channel, i.guild, i.user, type);
            const ticket = await tickets.create(i.guild, channel, i.user, type, answers);

            const summaryLines = formQuestions.slice(0, 5).map(q => {
                const answer = answers[q.id] || "*No answer*";
                return `**${q.label}:** ${answer}`;
            });

            const welcome = type?.welcomeMessage || "A staff member will be with you shortly.";

            const embed = new EmbedBuilder()
                .setColor(Theme.ticket)
                .setTitle(type?.displayName || "Support Ticket")
                .setDescription(welcome)
                .addFields(stat("Ticket", `#${ticket.id.slice(0, 8)}`))
                .setFooter({ text: Brand.footer })
                .setTimestamp();

            if (summaryLines.length > 0) {
                embed.addFields({ name: "Request Summary", value: summaryLines.join("\n"), inline: false });
            }

            if (type?.instructions) {
                embed.addFields({ name: "Staff Instructions", value: type.instructions, inline: false });
            }

            const workspaceEmbed = buildWorkspaceEmbed(ticket, type);
            const workspaceButtons = buildWorkspaceButtons(ticket);

            await channel.send({ embeds: [embed] }).catch(() => {});
            await channel.send({ embeds: [workspaceEmbed], components: workspaceButtons }).catch(() => {});

            if (config?.ticketLogChannelId) {
                const logCh = i.guild.channels.cache.get(config.ticketLogChannelId);
                if (logCh?.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(Theme.info)
                        .setTitle("Ticket Opened")
                        .setDescription(`<@${i.user.id}> opened **${type?.displayName || "General"}** in <#${channel.id}>`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await logCh.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            await i.editReply({ embeds: [success("Ticket Created", `<#${channel.id}> — ${type?.displayName || "Support"}`)] });
        } catch (e) {
            if (i.deferred) {
                await i.editReply({ embeds: [error("Failed", e.message || "Could not create ticket")] }).catch(() => {});
            } else if (!i.replied) {
                await i.reply({ embeds: [error("Failed", e.message || "Could not create ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET OPEN: SELECT MENU
    // ═══════════════════════════════════════

    "ticket:open:select": async (i, client) => {
        try {
            const typeId = i.values[0];
            const prisma = client.services.prisma;
            const tickets = client.services.tickets;

            const type = await prisma.ticketType.findUnique({ where: { id: typeId } });

            // Limits check
            if (type?.maxOpen && type.maxOpen > 0) {
                const openCount = await tickets.countOpenByType(i.guild.id, type.id);
                if (openCount >= type.maxOpen) {
                    return i.reply({ embeds: [error("Limit Reached", `Max **${type.maxOpen}** open tickets for this type.`)], flags: MessageFlags.Ephemeral });
                }
            }

            // Cooldown check
            if (type?.cooldown && type.cooldown > 0) {
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

            // Existing ticket check
            const existing = await tickets.getOpenByUser(i.guild.id, i.user.id);
            if (existing) {
                return i.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });
            }

            // Check if type has form questions
            const formQuestions = type ? JSON.parse(type.formQuestions || "[]") : [];
            if (formQuestions.length > 0) {
                const inputs = formQuestions.slice(0, 5).map(q => ({
                    id: q.id,
                    label: q.label.slice(0, 45),
                    required: q.required ?? true,
                    style: q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short,
                    placeholder: (q.placeholder || "").slice(0, 100),
                }));
                const m = modal(`${type.displayName} — Form`, `ticket:open:form:${typeId}`, inputs);
                return i.showModal(m);
            }

            // No form — create ticket directly
            await i.deferReply({ flags: MessageFlags.Ephemeral });

            const config = await client.services.settings.get(i.guild.id);
            const parentId = type?.categoryId || config?.ticketCategoryId || null;

            const channel = await i.guild.channels.create({
                name: `${type?.channelPrefix || "ticket"}-${i.user.username}`.slice(0, 100),
                type: ChannelType.GuildText,
                parent: parentId,
            }).catch(e => {
                throw new Error(`Could not create channel: ${e.message}`);
            });

            await tickets.applyPermissions(channel, i.guild, i.user, type);
            const ticket = await tickets.create(i.guild, channel, i.user, type);

            const welcome = type?.welcomeMessage || "A staff member will be with you shortly.";

            const embed = new EmbedBuilder()
                .setColor(Theme.ticket)
                .setTitle(type?.displayName || "Support Ticket")
                .setDescription(welcome)
                .addFields(stat("Ticket", `#${ticket.id.slice(0, 8)}`))
                .setFooter({ text: Brand.footer })
                .setTimestamp();

            if (type?.instructions) {
                embed.addFields({ name: "Staff Instructions", value: type.instructions, inline: false });
            }

            const workspaceEmbed = buildWorkspaceEmbed(ticket, type);
            const workspaceButtons = buildWorkspaceButtons(ticket);

            await channel.send({ embeds: [embed] }).catch(() => {});
            await channel.send({ embeds: [workspaceEmbed], components: workspaceButtons }).catch(() => {});

            if (config?.ticketLogChannelId) {
                const logCh = i.guild.channels.cache.get(config.ticketLogChannelId);
                if (logCh?.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(Theme.info)
                        .setTitle("Ticket Opened")
                        .setDescription(`<@${i.user.id}> opened **${type?.displayName || "General"}** in <#${channel.id}>`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await logCh.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            await i.editReply({ embeds: [success("Ticket Created", `<#${channel.id}> — ${type?.displayName || "Support"}`)] });
        } catch (e) {
            if (i.deferred) {
                await i.editReply({ embeds: [error("Failed", e.message || "Could not create ticket")] }).catch(() => {});
            } else if (!i.replied) {
                await i.reply({ embeds: [error("Failed", e.message || "Could not create ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: CLAIM
    // ═══════════════════════════════════════

    "ticket:ws:claim:": async (i, client) => {
        try {
            const ticketId = i.customId.split(":")[3];
            const tickets = client.services.tickets;

            await tickets.claim(ticketId, i.user.id);
            const ticket = await tickets.getById(ticketId);
            const type = ticket?.typeId ? await client.services.prisma.ticketType.findUnique({ where: { id: ticket.typeId } }) : null;

            await i.reply({ embeds: [success("Claimed", `<@${i.user.id}> is now handling this ticket.`)] });

            if (ticket) {
                const embed = buildWorkspaceEmbed(ticket, type);
                const buttons = buildWorkspaceButtons(ticket);
                await i.channel.send({ embeds: [embed], components: buttons }).catch(() => {});
            }
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Cannot Claim", e.message || "Claim failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: CLOSE
    // ═══════════════════════════════════════

    "ticket:ws:close:": async (i, client) => {
        try {
            const ticketId = i.customId.split(":")[3];
            const tickets = client.services.tickets;

            const ticket = await tickets.getById(ticketId);
            if (!ticket) return i.reply({ embeds: [error("Not Found", "Ticket not found.")], flags: MessageFlags.Ephemeral });
            if (ticket.status === "CLOSED") return i.reply({ embeds: [error("Already Closed", "Ticket is already closed.")], flags: MessageFlags.Ephemeral });

            await tickets.close(i.channel.id, i.user.id);
            await i.reply({ embeds: [success("Closed", "Channel will be deleted shortly.")] });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Close failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: STATUS
    // ═══════════════════════════════════════

    "ticket:ws:status:": async (i, client) => {
        const ticketId = i.customId.split(":")[3];
        const tickets = client.services.tickets;

        const ticket = await tickets.getById(ticketId);
        if (!ticket) return i.reply({ embeds: [error("Not Found", "Ticket not found.")], flags: MessageFlags.Ephemeral });

        const options = ["OPEN", "CLAIMED", "IN_PROGRESS", "WAITING", "RESOLVED"]
            .filter(s => s !== ticket.status)
            .map(s => ({ label: s.replace("_", " "), value: s }));

        const select = selectMenu(`ticket:ws:status:set:${ticketId}`, "Select new status", options);
        await i.reply({ components: [row(select)], flags: MessageFlags.Ephemeral });
    },

    "ticket:ws:status:set:": async (i, client) => {
        try {
            const ticketId = i.customId.split(":")[4];
            const tickets = client.services.tickets;
            const newStatus = i.values[0];

            await tickets.setStatus(ticketId, newStatus, i.user.id);

            const ticket = await tickets.getById(ticketId);
            const type = ticket?.typeId ? await client.services.prisma.ticketType.findUnique({ where: { id: ticket.typeId } }) : null;

            await i.update({ components: [] });
            await i.channel.send({ embeds: [success("Status Updated", `Ticket status set to **${newStatus}** by <@${i.user.id}>.`)] }).catch(() => {});

            if (ticket) {
                const embed = buildWorkspaceEmbed(ticket, type);
                const buttons = buildWorkspaceButtons(ticket);
                await i.channel.send({ embeds: [embed], components: buttons }).catch(() => {});
            }
        } catch (e) {
            await i.update({ components: [] }).catch(() => {});
            await i.channel.send({ embeds: [error("Cannot Update", e.message || "Status update failed")] }).catch(() => {});
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: PRIORITY
    // ═══════════════════════════════════════

    "ticket:ws:priority:": async (i, client) => {
        const ticketId = i.customId.split(":")[3];
        const tickets = client.services.tickets;

        const ticket = await tickets.getById(ticketId);
        if (!ticket) return i.reply({ embeds: [error("Not Found", "Ticket not found.")], flags: MessageFlags.Ephemeral });

        const options = ["LOW", "NORMAL", "HIGH", "URGENT"]
            .filter(p => p !== ticket.priority)
            .map(p => ({ label: p, value: p }));

        const select = selectMenu(`ticket:ws:priority:set:${ticketId}`, "Select new priority", options);
        await i.reply({ components: [row(select)], flags: MessageFlags.Ephemeral });
    },

    "ticket:ws:priority:set:": async (i, client) => {
        try {
            const ticketId = i.customId.split(":")[4];
            const tickets = client.services.tickets;
            const newPriority = i.values[0];

            await tickets.setPriority(ticketId, newPriority, i.user.id);

            const ticket = await tickets.getById(ticketId);
            const type = ticket?.typeId ? await client.services.prisma.ticketType.findUnique({ where: { id: ticket.typeId } }) : null;

            await i.update({ components: [] });
            await i.channel.send({ embeds: [success("Priority Updated", `Ticket priority set to **${newPriority}** by <@${i.user.id}>.`)] }).catch(() => {});

            if (ticket) {
                const embed = buildWorkspaceEmbed(ticket, type);
                const buttons = buildWorkspaceButtons(ticket);
                await i.channel.send({ embeds: [embed], components: buttons }).catch(() => {});
            }
        } catch (e) {
            await i.update({ components: [] }).catch(() => {});
            await i.channel.send({ embeds: [error("Cannot Update", e.message || "Priority update failed")] }).catch(() => {});
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: NOTE
    // ═══════════════════════════════════════

    "ticket:ws:note:": async (i, client) => {
        const ticketId = i.customId.split(":")[3];
        const m = modal("Add Internal Note", `ticket:ws:note:submit:${ticketId}`, [
            { id: "content", label: "Note (staff-only)", required: true, style: TextInputStyle.Paragraph, maxLength: 1000, placeholder: "Internal context for other staff..." },
        ]);
        await i.showModal(m);
    },

    "ticket:ws:note:submit:": async (i, client) => {
        try {
            const ticketId = i.customId.split(":")[4];
            const tickets = client.services.tickets;
            const content = (i.components.getTextInputValue("content") || "").trim();

            if (!content) {
                return i.reply({ embeds: [error("Invalid", "Note content is required.")], flags: MessageFlags.Ephemeral });
            }

            await tickets.addNote(ticketId, i.user.id, content);
            await i.reply({ embeds: [success("Note Added", "Internal note recorded. Staff-only.")], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Note failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: ADD USER
    // ═══════════════════════════════════════

    "ticket:ws:adduser:": async (i, client) => {
        const ticketId = i.customId.split(":")[3];
        const m = modal("Add User", `ticket:ws:adduser:submit:${ticketId}`, [
            { id: "userid", label: "User ID", required: true, placeholder: "Discord user ID" },
        ]);
        await i.showModal(m);
    },

    "ticket:ws:adduser:submit:": async (i, client) => {
        try {
            const userId = (i.components.getTextInputValue("userid") || "").trim();
            if (!userId || !/^\d{17,20}$/.test(userId)) {
                return i.reply({ embeds: [error("Invalid", "Provide a valid Discord user ID (17-20 digits).")], flags: MessageFlags.Ephemeral });
            }

            const member = await i.guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return i.reply({ embeds: [error("Not Found", "Could not find that member in this server.")], flags: MessageFlags.Ephemeral });
            }

            await i.channel.permissionOverwrites.edit(userId, {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
            });
            await i.reply({ embeds: [success("User Added", `<@${userId}> can now access this ticket.`)] });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Add user failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: REMOVE USER
    // ═══════════════════════════════════════

    "ticket:ws:rmuser:": async (i, client) => {
        const ticketId = i.customId.split(":")[3];
        const m = modal("Remove User", `ticket:ws:rmuser:submit:${ticketId}`, [
            { id: "userid", label: "User ID", required: true, placeholder: "Discord user ID" },
        ]);
        await i.showModal(m);
    },

    "ticket:ws:rmuser:submit:": async (i, client) => {
        try {
            const userId = (i.components.getTextInputValue("userid") || "").trim();
            if (!userId || !/^\d{17,20}$/.test(userId)) {
                return i.reply({ embeds: [error("Invalid", "Provide a valid Discord user ID (17-20 digits).")], flags: MessageFlags.Ephemeral });
            }

            await i.channel.permissionOverwrites.edit(userId, { ViewChannel: false });
            await i.reply({ embeds: [success("User Removed", `<@${userId}> can no longer access this ticket.`)] });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Remove user failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  TICKET WORKSPACE: TRANSCRIPT
    // ═══════════════════════════════════════

    "ticket:ws:transcript:": async (i, client) => {
        try {
            const ticketId = i.customId.split(":")[3];
            const tickets = client.services.tickets;

            const ticket = await tickets.getById(ticketId);
            if (!ticket) return i.reply({ embeds: [error("Not Found", "Ticket not found.")], flags: MessageFlags.Ephemeral });

            const transcript = await tickets.buildTranscript(i.channel);
            if (!transcript) {
                return i.reply({ embeds: [error("Failed", "Could not generate transcript.")], flags: MessageFlags.Ephemeral });
            }

            const { AttachmentBuilder } = await import("discord.js");
            const buffer = Buffer.from(transcript, "utf-8");
            const attachment = new AttachmentBuilder(buffer, { name: `transcript-${ticket.id.slice(0, 8)}.json` });

            await i.reply({ files: [attachment], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Transcript failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    // ═══════════════════════════════════════
    //  RATING
    // ═══════════════════════════════════════

    "ticketrate:": async (i, client) => {
        try {
            const parts = i.customId.split(":");
            const ticketId = parts[1];
            const rating = parseInt(parts[2]);
            if (!ticketId || isNaN(rating) || rating < 1 || rating > 5) {
                return i.reply({ embeds: [error("Error", "Invalid rating.")], flags: MessageFlags.Ephemeral });
            }

            const ticket = await client.services.tickets.getById(ticketId);
            if (!ticket) {
                return i.reply({ embeds: [error("Error", "Ticket not found.")], flags: MessageFlags.Ephemeral });
            }

            await client.services.tickets.rate(ticketId, ticket.channelId, ticket.guildId, i.user.id, rating);

            const stars = "⭐".repeat(rating);
            await i.reply({ embeds: [success("Thanks!", `You rated this ticket **${stars}** (${rating}/5)`)], flags: MessageFlags.Ephemeral });
        } catch (e) {
            if (!i.replied && !i.deferred) {
                await i.reply({ embeds: [error("Failed", e.message || "Rating failed")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },
};
