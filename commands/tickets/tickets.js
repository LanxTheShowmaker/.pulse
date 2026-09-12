import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags, ChannelType, ButtonStyle } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { success, error, panel, stat } from "../../ui/embeds.js";
import { button, selectMenu, row } from "../../ui/components.js";
import { Theme, Brand } from "../../ui/theme.js";

export default {
    category: "tickets",
    data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Ticket system management")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName("config").setDescription("Open the ticket configurator"))
        .addSubcommand(sub => sub.setName("setup").setDescription("Quick setup wizard"))
        .addSubcommand(sub => sub.setName("create").setDescription("Create a support ticket")
            .addStringOption(o => o.setName("reason").setDescription("Reason for opening").setRequired(false)))
        .addSubcommand(sub => sub.setName("close").setDescription("Close the current ticket"))
        .addSubcommand(sub => sub.setName("claim").setDescription("Claim the current ticket"))
        .addSubcommand(sub => sub.setName("unassign").setDescription("Unassign the current ticket"))
        .addSubcommand(sub => sub.setName("status").setDescription("Change ticket status")
            .addStringOption(o => o.setName("status").setDescription("New status").setRequired(true)
                .addChoices(
                    { name: "Open", value: "OPEN" },
                    { name: "Claimed", value: "CLAIMED" },
                    { name: "In Progress", value: "IN_PROGRESS" },
                    { name: "Waiting", value: "WAITING" },
                    { name: "Resolved", value: "RESOLVED" },
                    { name: "Closed", value: "CLOSED" },
                )))
        .addSubcommand(sub => sub.setName("priority").setDescription("Change ticket priority")
            .addStringOption(o => o.setName("priority").setDescription("New priority").setRequired(true)
                .addChoices(
                    { name: "Low", value: "LOW" },
                    { name: "Normal", value: "NORMAL" },
                    { name: "High", value: "HIGH" },
                    { name: "Urgent", value: "URGENT" },
                )))
        .addSubcommand(sub => sub.setName("note").setDescription("Add an internal note")
            .addStringOption(o => o.setName("content").setDescription("Note content").setRequired(true)))
        .addSubcommand(sub => sub.setName("history").setDescription("View ticket history"))
        .addSubcommand(sub => sub.setName("list").setDescription("List open tickets"))
        .addSubcommand(sub => sub.setName("stats").setDescription("Ticket statistics"))
        .addSubcommand(sub => sub.setName("triage").setDescription("View triage AI stats and test analysis")
            .addStringOption(o => o.setName("text").setDescription("Text to analyze (for testing)").setRequired(false))),

    async execute(interaction) {
        const { tickets } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "config": return this.handleConfig(interaction);
            case "setup": return this.handleSetup(interaction);
            case "create": return this.handleCreate(interaction, tickets);
            case "close": return this.handleClose(interaction, tickets);
            case "claim": return this.handleClaim(interaction, tickets);
            case "unassign": return this.handleUnassign(interaction, tickets);
            case "status": return this.handleStatus(interaction, tickets);
            case "priority": return this.handlePriority(interaction, tickets);
            case "note": return this.handleNote(interaction, tickets);
            case "history": return this.handleHistory(interaction, tickets);
            case "list": return this.handleList(interaction, tickets);
            case "stats": return this.handleStats(interaction, tickets);
            case "triage": return this.handleTriage(interaction);
        }
    },

    async handleConfig(interaction) {
        const prisma = interaction.client.services.prisma;
        const guildId = interaction.guild.id;

        const [types, settings, openCount, totalCount] = await Promise.all([
            prisma.ticketType.findMany({ where: { guildId } }),
            interaction.client.services.settings.get(guildId),
            prisma.ticket.count({ where: { guildId, status: { notIn: ["CLOSED"] } } }),
            prisma.ticket.count({ where: { guildId } }),
        ]);

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

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("Ticket Configuration")
            .setDescription(
                `**Category:** ${category}\n` +
                `**Log Channel:** ${logChannel}\n` +
                `**Open:** ${openCount} | **Total:** ${totalCount}\n\n` +
                `**Types:**\n${typeList}`
            )
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        const components = [
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

        await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    },

    async handleSetup(interaction) {
        const prisma = interaction.client.services.prisma;
        const guildId = interaction.guild.id;

        const types = await prisma.ticketType.findMany({ where: { guildId } });
        const settings = await interaction.client.services.settings.get(guildId);

        const steps = [];
        steps.push(settings?.ticketCategoryId ? `✅ Category: <#${settings.ticketCategoryId}>` : `❌ Category: Not set`);
        steps.push(settings?.ticketLogChannelId ? `✅ Log: <#${settings.ticketLogChannelId}>` : `❌ Log: Not set`);
        steps.push(types.length > 0 ? `✅ Types: ${types.length} configured` : `❌ Types: None configured`);

        const embed = new EmbedBuilder()
            .setColor(Theme.panel)
            .setTitle("Ticket Setup Wizard")
            .setDescription("Checklist for getting tickets running:\n\n" + steps.join("\n"))
            .setFooter({ text: "Click the buttons below to configure each part" })
            .setTimestamp();

        const components = [
            row(
                button("Set Category", "ticket:cfg:category", ButtonStyle.Primary),
                button("Set Log", "ticket:cfg:log", ButtonStyle.Primary),
            ),
            row(
                button("Add Type", "ticket:cfg:types:add", ButtonStyle.Success),
                button("Deploy Panel", "ticket:cfg:panel:deploy", ButtonStyle.Success),
            ),
        ];

        await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    },

    async handleCreate(interaction, tickets) {
        const existing = await interaction.client.services.prisma.ticket.findFirst({
            where: { guildId: interaction.guild.id, openerId: interaction.user.id, status: { notIn: ["CLOSED"] } },
        });
        if (existing) return interaction.reply({ embeds: [error("Already Open", `You already have an open ticket: <#${existing.channelId}>`)], flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const config = await interaction.client.services.settings.get(interaction.guild.id);
        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategoryId || null,
        });

        await tickets.applyPermissions(channel, interaction.guild, interaction.user, null);
        const ticket = await tickets.create(interaction.guild, channel, interaction.user, null);

        const embed = new EmbedBuilder()
            .setColor(Theme.ticket)
            .setTitle("Support Ticket")
            .setDescription(interaction.options.getString("reason") || "A staff member will be with you shortly.")
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
        await interaction.editReply({ embeds: [success("Ticket Created", `<#${channel.id}>`)] });
    },

    async handleClose(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });
        if (!["OPEN", "CLAIMED", "IN_PROGRESS", "WAITING", "RESOLVED"].includes(ticket.status)) {
            return interaction.reply({ embeds: [error("Invalid State", `Ticket is already ${ticket.status}.`)], flags: MessageFlags.Ephemeral });
        }

        await tickets.close(interaction.channel.id, interaction.user.id);
        await interaction.reply({ embeds: [success("Ticket Closed", "Channel will be deleted shortly.")] });
    },

    async handleClaim(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        try {
            await tickets.claim(ticket.id, interaction.user.id);
            await interaction.reply({ embeds: [success("Ticket Claimed", `<@${interaction.user.id}> is now handling this ticket.`)] });
        } catch (e) {
            await interaction.reply({ embeds: [error("Cannot Claim", e.message)], flags: MessageFlags.Ephemeral });
        }
    },

    async handleUnassign(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        try {
            await tickets.unassign(ticket.id, interaction.user.id);
            await interaction.reply({ embeds: [success("Unassigned", "Ticket is no longer assigned.")] });
        } catch (e) {
            await interaction.reply({ embeds: [error("Error", e.message)], flags: MessageFlags.Ephemeral });
        }
    },

    async handleStatus(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        const newStatus = interaction.options.getString("status");
        try {
            await tickets.setStatus(ticket.id, newStatus, interaction.user.id);
            await interaction.reply({ embeds: [success("Status Updated", `Ticket status set to **${newStatus}**.`)] });
        } catch (e) {
            await interaction.reply({ embeds: [error("Cannot Update", e.message)], flags: MessageFlags.Ephemeral });
        }
    },

    async handlePriority(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        const newPriority = interaction.options.getString("priority");
        try {
            await tickets.setPriority(ticket.id, newPriority, interaction.user.id);
            await interaction.reply({ embeds: [success("Priority Updated", `Ticket priority set to **${newPriority}**.`)] });
        } catch (e) {
            await interaction.reply({ embeds: [error("Cannot Update", e.message)], flags: MessageFlags.Ephemeral });
        }
    },

    async handleNote(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        const content = interaction.options.getString("content");
        try {
            await tickets.addNote(ticket.id, interaction.user.id, content);
            await interaction.reply({ embeds: [success("Note Added", "Internal note recorded. Staff-only.")], flags: MessageFlags.Ephemeral });
        } catch (e) {
            await interaction.reply({ embeds: [error("Error", e.message)], flags: MessageFlags.Ephemeral });
        }
    },

    async handleHistory(interaction, tickets) {
        const ticket = await tickets.getByChannel(interaction.channel.id);
        if (!ticket) return interaction.reply({ embeds: [error("No Ticket", "No open ticket in this channel.")], flags: MessageFlags.Ephemeral });

        const history = await tickets.getHistory(ticket.id);
        if (!history.length) return interaction.reply({ embeds: [panel("History", "No events recorded yet.")] });

        const lines = history.map(h => {
            const time = `<t:${Math.floor(h.createdAt.getTime() / 1000)}:R>`;
            const actor = h.actorId ? `<@${h.actorId}>` : "System";
            return `${time} **${h.event}** by ${actor}${h.details ? ` — ${h.details}` : ""}`;
        });

        await interaction.reply({ embeds: [panel("Ticket History", lines.join("\n"))], flags: MessageFlags.Ephemeral });
    },

    async handleList(interaction, tickets) {
        const list = await tickets.listOpen(interaction.guild.id);
        if (!list.length) return interaction.reply({ embeds: [panel("Open Tickets", "No open tickets.")] });

        const lines = list.map(t => {
            const priority = t.priority !== "NORMAL" ? ` [${t.priority}]` : "";
            return `<#${t.channelId}> — <@${t.openerId}> — **${t.status}**${priority} — <t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`;
        });

        await interaction.reply({ embeds: [panel("Open Tickets", lines.join("\n"))] });
    },

    async handleStats(interaction, tickets) {
        const stats = await tickets.getStats(interaction.guild.id);
        const avgText = stats.avgRating ? `${stats.avgRating.toFixed(1)}/5 (${stats.ratedCount} ratings)` : "No ratings yet";
        await interaction.reply({
            embeds: [panel("Ticket Stats", [
                `**Open:** ${stats.open}`,
                `**Closed:** ${stats.closed}`,
                `**Total:** ${stats.total}`,
                `**Avg Rating:** ${avgText}`,
            ].join("\n"))],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleTriage(interaction) {
        const { triage } = interaction.client.services;
        const text = interaction.options.getString("text");

        if (text) {
            const result = triage.analyze(text, { guildId: interaction.guild.id });
            const urgencyEmoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

            const lines = [
                `**Input:** ${text}`,
                ``,
                `**Category:** ${result.category}`,
                `**Urgency:** ${urgencyEmoji[result.urgency] || "⚪"} ${result.urgency}`,
                `**Sentiment:** ${result.sentiment > 0.3 ? "Positive" : result.sentiment < -0.3 ? "Negative" : "Neutral"} (${result.sentiment.toFixed(2)})`,
                `**Confidence:** ${Math.round(result.confidence * 100)}%`,
                ``,
            ];

            if (result.suggestions.length > 0) {
                lines.push("**Suggestions:**");
                for (const s of result.suggestions) lines.push(`• ${s.text}`);
            }

            await interaction.reply({ embeds: [panel("Triage Analysis", lines.join("\n"))], flags: MessageFlags.Ephemeral });
        } else {
            const stats = triage.getGuildStats(interaction.guild.id);
            const catLines = Object.entries(stats.categories).sort(([,a], [,b]) => b - a).map(([cat, count]) => `**${cat}:** ${count}`).join("\n") || "No data yet";
            const urgLines = Object.entries(stats.urgencies).sort(([,a], [,b]) => b - a).map(([urg, count]) => `**${urg}:** ${count}`).join("\n") || "No data yet";

            await interaction.reply({
                embeds: [panel("Triage Stats", [
                    `**Total Tickets Analyzed:** ${stats.total}`,
                    ``,
                    `**By Category:**`,
                    catLines,
                    ``,
                    `**By Urgency:**`,
                    urgLines,
                ].join("\n"))],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
