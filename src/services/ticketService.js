import { ActionRowBuilder, ButtonBuilder, SelectMenuBuilder, ModalBuilder, TextInputBuilder, EmbedBuilder } from "@discordjs/builders";
import { ChannelType, PermissionFlagsBits, MessageFlags, UserSelectMenuComponent, ButtonStyle, TextInputStyle } from "discord.js";
import { embeds, confirmationRow } from "../design/embeds.js";
import { logger } from "../core/logger.js";
import { Theme, Brand } from "../design/theme.js";
import { isStaff } from "../core/services.js";

const STATUS = { OPEN: "OPEN", CLAIMED: "CLAIMED", WAITING: "WAITING", IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED", CLOSED: "CLOSED" };
const PRIORITY = { LOW: "LOW", NORMAL: "NORMAL", HIGH: "HIGH", URGENT: "URGENT" };

export { STATUS, PRIORITY };

export class TicketService {
    prisma;
    client;
    settings;
    logging;
    _deleteInterval = null;
    _startupTimeout = null;

    constructor(prisma, client, settings, logging) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
        this.logging = logging;
        this._deleteInterval = setInterval(() => this.checkDeletions().catch(e => logger.error("tickets", "autodelete failed", e)), 60_000);
        if (this._deleteInterval.unref) this._deleteInterval.unref();
        this._startupTimeout = setTimeout(() => this.checkDeletions().catch(() => {}), 30_000);
        if (this._startupTimeout.unref) this._startupTimeout.unref();
    }

    shutdown() {
        if (this._deleteInterval) clearInterval(this._deleteInterval);
        if (this._startupTimeout) clearTimeout(this._startupTimeout);
    }

    // ─── Helpers ───────────────────────────────────────────

    sanitizeName(name) {
        let s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        return (s || "user").slice(0, 12);
    }

    async uniqueChannelName(guild, categoryKey, userName, shortId) {
        const cat = String(categoryKey || "ticket").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 15);
        const user = this.sanitizeName(userName);
        const id = String(shortId).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
        const base = `${cat}-${user}-${id}`.replace(/-+/g, "-").slice(0, 90);
        let name = base;
        let n = 1;
        while (guild.channels.cache.some(c => c.name === name)) {
            name = `${base}-${n}`.slice(0, 100);
            n++;
        }
        return name;
    }

    async findCategory(guild, type) {
        if (type?.categoryId) {
            const cat = guild.channels.cache.get(type.categoryId) ?? await guild.channels.fetch(type.categoryId).catch(() => null);
            if (cat?.type === ChannelType.GuildCategory) return cat;
        }
        const candidates = type?.panelType === "ORDER" ? ["orders", "design-orders", "tickets"] : ["support", "assistance", "tickets"];
        for (const cand of candidates) {
            for (const ch of guild.channels.cache.values()) {
                if (ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === cand) return ch;
            }
        }
        return null;
    }

    parseRoleIds(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(Boolean);
        try { return JSON.parse(raw).filter(Boolean); } catch { return []; }
    }

    async buildOverwrites(guild, openerId, type) {
        const cfg = await this.settings.get(guild.id).catch(() => null);
        const staffIds = this.parseRoleIds(type?.staffRoleIds);
        const modIds = this.parseRoleIds(type?.moderatorRoleIds);
        const globalStaff = this.parseRoleIds(cfg?.staffRoleIds);
        const effectiveStaff = staffIds.length ? staffIds : globalStaff;
        const effectiveMod = modIds.length ? modIds : this.parseRoleIds(cfg?.moderatorRoleIds);
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: openerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
        ];
        for (const id of new Set([...effectiveStaff, ...effectiveMod])) {
            overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
        }
        return overwrites;
    }

    async canOpen(guild, userId, type) {
        const maxOpen = type.maxOpen ?? 3;
        const open = await this.prisma.ticket.count({ where: { guildId: guild.id, openerId: userId, status: { not: STATUS.CLOSED } } }).catch(() => 0);
        if (open >= maxOpen) return { ok: false, reason: `You have ${open} open ticket(s) (max ${maxOpen}). Close one before opening another.` };
        if (type.cooldown > 0) {
            const last = await this.prisma.ticket.findFirst({ where: { guildId: guild.id, openerId: userId, typeId: type.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null);
            if (last) {
                const elapsed = Date.now() - last.createdAt.getTime();
                if (elapsed < type.cooldown * 1000) {
                    const remain = Math.ceil((type.cooldown * 1000 - elapsed) / 1000);
                    return { ok: false, reason: `Cooldown: wait ${remain}s before opening another ${type.displayName} ticket.` };
                }
            }
        }
        return { ok: true };
    }

    async isTicketStaff(member, guildId) {
        try {
            if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
        } catch { return false; }
        const cfg = await this.settings.get(guildId).catch(() => null);
        try { return isStaff(member, cfg); } catch { return false; }
    }

    async requireTicketStaff(i) {
        if (await this.isTicketStaff(i.member, i.guild.id)) return true;
        await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can use ticket controls.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        return false;
    }

    async fetchScopedTicket(i, channelId) {
        const ticket = await this.prisma.ticket.findUnique({ where: { channelId } }).catch(() => null);
        if (!ticket) {
            await i.reply({ embeds: [embeds.error("Not found", "Ticket not found in database.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return null;
        }
        if (ticket.guildId !== i.guild.id || ticket.channelId !== i.channelId) {
            await i.reply({ embeds: [embeds.error("Denied", "This ticket does not belong to this channel.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return null;
        }
        return ticket;
    }

    async canViewTicket(i, ticket) {
        if (ticket.openerId === i.user.id) return true;
        if (ticket.claimedById && ticket.claimedById === i.user.id) return true;
        return this.isTicketStaff(i.member, i.guild.id);
    }

    // ─── Ticket Creation ───────────────────────────────────

    async createTicket(guild, member, type, answers) {
        const shortId = Math.random().toString(36).slice(2, 6).toLowerCase();
        const channelName = await this.uniqueChannelName(guild, type.key || type.panelType, member.user.username, shortId);
        const category = await this.findCategory(guild, type);
        const overwrites = await this.buildOverwrites(guild, member.id, type);

        let channel;
        try {
            channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category?.id ?? null,
                permissionOverwrites: overwrites,
                topic: `Ticket ${type.displayName} \u2022 ${member.user.tag}`,
            });
        } catch (e) {
            logger.error("tickets", "channel creation failed", e);
            throw new Error("Failed to create ticket channel. Check bot permissions.");
        }

        let ticket;
        try {
            ticket = await this.prisma.ticket.create({
                data: {
                    guildId: guild.id,
                    channelId: channel.id,
                    openerId: member.id,
                    typeId: type.id,
                    panelType: type.panelType,
                    status: STATUS.OPEN,
                    priority: type.priority ?? PRIORITY.NORMAL,
                },
            });
        } catch (e) {
            logger.error("tickets", "DB insert failed after channel creation", e);
            await channel.delete("Ticket creation failed").catch(() => {});
            throw new Error("Failed to save ticket to database.");
        }

        const welcome = this.buildWelcomeEmbed(type, member, answers, guild);
        const rows = this.buildTicketRows(channel.id, ticket);
        await channel.send({ content: `<@${member.id}>`, embeds: [welcome], components: rows }).catch(() => {});

        try {
            const logCh = await this.logging?.channel(guild, "mod");
            if (logCh) await logCh.send({ embeds: [embeds.moderation("Ticket created", `${type.displayName} by <@${member.id}>`, [{ name: "Channel", value: `<#${channel.id}>`, inline: true }])] }).catch(() => {});
        } catch {}

        return ticket;
    }

    buildWelcomeEmbed(type, member, answers, guild) {
        const embed = new EmbedBuilder().setColor(0x2B2D31).setTitle(`${type.displayName} Ticket`).setDescription(`<@${member.id}> \u2014 answer the questions below so staff can assist.`);
        const termsText = type.instructions ? type.instructions.slice(0, 1024) : `By placing an order you agree to the full Terms & Conditions.\nAll orders are strictly **non-refundable** unless a member of the Executive Board decides otherwise.`;
        embed.addFields({ name: "Terms of Service", value: termsText, inline: false });
        let infoValue;
        if (answers.length) {
            infoValue = answers.map(a => `\u2022 **${a.question}**: ${a.answer.slice(0, 200)}`).join("\n");
            if (infoValue.length > 1024) infoValue = infoValue.slice(0, 1021) + "\u2026";
        } else if (type.panelType === "ORDER") {
            infoValue = "Please provide to your designer:\n\u2022 References (image form)\n\u2022 Quantity\n\u2022 Budget";
        } else {
            infoValue = "Please provide:\n\u2022 Detailed description of your request\n\u2022 Any relevant images or links\n\u2022 Desired timeline";
        }
        embed.addFields({ name: "Information", value: infoValue, inline: false });
        embed.setFooter({ text: Brand.footer });
        embed.setTimestamp();
        return embed;
    }

    buildTicketRows(channelId, ticket) {
        const isClaimed = !!ticket?.claimedById;
        const row1 = new ActionRowBuilder().addComponents(
            isClaimed
                ? new ButtonBuilder().setCustomId(`ticket:unclaim:${channelId}`).setLabel("Unclaim").setStyle(ButtonStyle.Secondary)
                : new ButtonBuilder().setCustomId(`ticket:claim:${channelId}`).setLabel("Claim").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ticket:close:${channelId}`).setLabel("Close").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ticket:reopen:${channelId}`).setLabel("Reopen").setStyle(ButtonStyle.Success).setDisabled(ticket?.status !== STATUS.CLOSED),
            new ButtonBuilder().setCustomId(`ticket:info:${channelId}`).setLabel("Info").setStyle(ButtonStyle.Secondary),
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket:add:${channelId}`).setLabel("Add User").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ticket:remove:${channelId}`).setLabel("Remove").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ticket:transcript:${channelId}`).setLabel("Transcript").setStyle(ButtonStyle.Secondary),
        );
        const priorityMenu = new SelectMenuBuilder().setCustomId(`ticket:priority:${channelId}`).setPlaceholder("Set priority").addOptions([
            { label: "Low", value: PRIORITY.LOW },
            { label: "Normal", value: PRIORITY.NORMAL },
            { label: "High", value: PRIORITY.HIGH },
            { label: "Urgent", value: PRIORITY.URGENT },
        ]);
        const statusMenu = new SelectMenuBuilder().setCustomId(`ticket:status:${channelId}`).setPlaceholder("Set status").addOptions([
            { label: "Open", value: STATUS.OPEN },
            { label: "Claimed", value: STATUS.CLAIMED },
            { label: "Waiting", value: STATUS.WAITING },
            { label: "In Progress", value: STATUS.IN_PROGRESS },
            { label: "Completed", value: STATUS.COMPLETED },
            { label: "Closed", value: STATUS.CLOSED },
        ]);
        return [row1, row2, new ActionRowBuilder().addComponents(priorityMenu), new ActionRowBuilder().addComponents(statusMenu)];
    }

    async updateTicketMessage(channel, ticket) {
        try {
            const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
            if (!msgs) return;
            const welcome = [...msgs.values()].find(m => m.author.id === this.client.user.id && m.embeds.length && m.embeds[0].title?.includes("Ticket"));
            if (!welcome) return;
            await welcome.edit({ components: this.buildTicketRows(channel.id, ticket) }).catch(() => {});
        } catch {}
    }

    // ─── Interaction Handlers ──────────────────────────────

    async handleClaim(i) {
        if (!i.isButton()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (ticket.status === STATUS.CLOSED) return i.reply({ embeds: [embeds.warn("Closed", "Ticket is closed")], flags: MessageFlags.Ephemeral }).catch(() => {});
        const type = ticket.typeId ? await this.prisma.ticketType.findUnique({ where: { id: ticket.typeId } }).catch(() => null) : null;
        if (type && !type.allowClaim) return i.reply({ embeds: [embeds.warn("Claim disabled", "Claiming disabled for this type")], flags: MessageFlags.Ephemeral }).catch(() => {});
        if (ticket.claimedById && ticket.claimedById !== i.user.id) return i.reply({ embeds: [embeds.warn("Claimed", `Already claimed by <@${ticket.claimedById}>`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        let updated;
        try {
            updated = await this.prisma.ticket.update({ where: { channelId }, data: { claimedById: i.user.id, status: STATUS.CLAIMED } });
        } catch (e) {
            logger.error("tickets", "claim update failed", e);
            return i.reply({ embeds: [embeds.error("Failed", "Could not claim ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await i.reply({ embeds: [embeds.success("Claimed", "You claimed this ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
        if (ch) {
            await ch.send({ embeds: [embeds.info("Claimed", `<@${i.user.id}> claimed this ticket`)] }).catch(() => {});
            await this.updateTicketMessage(ch, updated);
        }
    }

    async handleUnclaim(i) {
        if (!i.isButton()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        let updated;
        try {
            updated = await this.prisma.ticket.update({ where: { channelId }, data: { claimedById: null, status: STATUS.OPEN } });
        } catch (e) {
            logger.error("tickets", "unclaim update failed", e);
            return i.reply({ embeds: [embeds.error("Failed", "Could not unclaim ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await i.reply({ embeds: [embeds.success("Unclaimed", "Ticket unclaimed")], flags: MessageFlags.Ephemeral }).catch(() => {});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
        if (ch) await this.updateTicketMessage(ch, updated);
    }

    async handleStatusSelect(i) {
        if (!i.isStringSelectMenu()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        const val = i.values[0];
        try {
            await this.prisma.ticket.update({ where: { channelId }, data: { status: val } });
        } catch (e) {
            logger.error("tickets", "status update failed", e);
            return i.reply({ embeds: [embeds.error("Failed", "Could not update status")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await i.reply({ embeds: [embeds.success("Status", `Status set to ${val}`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        const ch = i.guild.channels.cache.get(channelId);
        if (ch) await ch.send({ embeds: [embeds.info("Status update", `Status \u2192 **${val}** by <@${i.user.id}>`)] }).catch(() => {});
    }

    async handlePrioritySelect(i) {
        if (!i.isStringSelectMenu()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        const val = i.values[0];
        try {
            await this.prisma.ticket.update({ where: { channelId }, data: { priority: val } });
        } catch (e) {
            logger.error("tickets", "priority update failed", e);
            return i.reply({ embeds: [embeds.error("Failed", "Could not update priority")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await i.reply({ embeds: [embeds.success("Priority", `Priority set to ${val}`)], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    async handleAddUser(i) {
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (i.customId.endsWith(":menu")) {
            if (!i.isUserSelectMenu()) return;
            const uid = i.values[0];
            const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
            if (ch) await ch.permissionOverwrites.edit(uid, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }).catch(() => {});
            return i.reply({ embeds: [embeds.success("Added", `<@${uid}> added`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const menu = new UserSelectMenuComponent({ custom_id: `ticket:add:${channelId}:menu`, placeholder: "Select user" });
        await i.reply({ embeds: [embeds.info("Add user", "Pick user to add")], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    async handleRemoveUser(i) {
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (i.customId.endsWith(":menu")) {
            if (!i.isUserSelectMenu()) return;
            const uid = i.values[0];
            const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
            if (ch) await ch.permissionOverwrites.delete(uid).catch(() => {});
            return i.reply({ embeds: [embeds.success("Removed", `<@${uid}> removed`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const menu = new UserSelectMenuComponent({ custom_id: `ticket:remove:${channelId}:menu`, placeholder: "Select user" });
        await i.reply({ embeds: [embeds.info("Remove user", "Pick user to remove")], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    async handleInfo(i) {
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (!await this.canViewTicket(i, ticket)) {
            return i.reply({ embeds: [embeds.error("Denied", "Only the ticket opener or staff can view this.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const ch = i.guild.channels.cache.get(channelId);
        const msgCount = ch ? (await ch.messages.fetch({ limit: 100 }).catch(() => null))?.size ?? "?" : "?";
        await i.reply({ embeds: [embeds.info("Ticket Info", `Channel: <#${channelId}>`, [
            { name: "ID", value: ticket.id, inline: true },
            { name: "Opener", value: `<@${ticket.openerId}>`, inline: true },
            { name: "Type", value: ticket.typeId ?? ticket.panelType ?? "\u2014", inline: true },
            { name: "Status", value: ticket.status, inline: true },
            { name: "Priority", value: ticket.priority, inline: true },
            { name: "Claimed", value: ticket.claimedById ? `<@${ticket.claimedById}>` : "\u2014", inline: true },
            { name: "Created", value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Messages", value: String(msgCount), inline: true },
        ])], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    async handleClose(i) {
        const channelId = i.customId.split(":")[2];
        if (!await this.requireTicketStaff(i)) return;
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (!i.customId.includes(":confirm")) {
            return i.reply({ embeds: [embeds.warn("Close ticket", "Confirm closing? This will archive and create a transcript.")], components: [confirmationRow({ acceptCustomId: `ticket:close:${channelId}:confirm`, cancelCustomId: `ticket:close:${channelId}:cancel`, acceptLabel: "Close", danger: true })], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        if (i.customId.endsWith(":cancel")) return i.update({ embeds: [embeds.info("Cancelled", "Not closed")], components: [] }).catch(() => {});
        await i.deferUpdate().catch(() => {});
        try {
            await this.prisma.ticket.update({ where: { channelId }, data: { status: STATUS.CLOSED, closedAt: new Date(), closedById: i.user.id } });
        } catch (e) {
            logger.error("tickets", "close update failed", e);
            return i.editReply({ embeds: [embeds.error("Failed", "Could not close ticket")] }).catch(() => {});
        }
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
        if (ch) {
            await ch.send({ embeds: [embeds.info("Closed", `Closed by <@${i.user.id}> \u2014 archiving...`)] }).catch(() => {});
            let htmlFile = null;
            try {
                const sortedMsgs = await this.fetchAllMessages(ch);
                const freshTicket = await this.prisma.ticket.findUnique({ where: { channelId } }).catch(() => ticket);
                const html = this.buildHtmlTranscript({ channel: ch, ticket: freshTicket, guild: i.guild, messages: sortedMsgs, closerId: i.user.id });
                htmlFile = { attachment: Buffer.from(html, "utf-8"), name: `transcript-${ch.name}-${ticket.id.slice(0, 4)}.html` };
            } catch (e) { logger.error("tickets", "html transcript failed", e); }
            try {
                let archiveCat = i.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && ["archive", "archives", "tickets-archive", "closed", "closed-tickets"].includes(c.name.toLowerCase()));
                if (!archiveCat) archiveCat = await i.guild.channels.create({ name: "archive", type: ChannelType.GuildCategory }).catch(() => null);
                if (archiveCat && ch.parentId !== archiveCat.id) await ch.setParent(archiveCat.id).catch(() => {});
                const baseName = ch.name.replace(/^archived-/, "");
                await ch.setName(`archived-${baseName}`.slice(0, 100)).catch(() => {});
                await ch.permissionOverwrites.edit(i.guild.roles.everyone.id, { ViewChannel: true, SendMessages: false }).catch(() => {});
                await ch.permissionOverwrites.edit(ticket.openerId, { ViewChannel: true, SendMessages: false }).catch(() => {});
                await ch.setTopic(`Archived \u2022 ${ticket.id} \u2022 Closed by ${i.user.tag} \u2022 ${new Date().toISOString()}`).catch(() => {});
            } catch (e) { logger.error("tickets", "archive move failed", e); }
            try {
                const cfg = await this.settings.get(i.guild.id).catch(() => null);
                if (cfg?.modLogChannelId && htmlFile) {
                    const logCh = i.guild.channels.cache.get(cfg.modLogChannelId) ?? await i.guild.channels.fetch(cfg.modLogChannelId).catch(() => null);
                    if (logCh?.isTextBased()) await logCh.send({ embeds: [embeds.moderation("Ticket Archived", `Ticket <#${channelId}> (\`${ch.name}\`) closed by <@${i.user.id}>`, [{ name: "Category", value: ticket.panelType || "\u2014", inline: true }, { name: "Opener", value: `<@${ticket.openerId}>`, inline: true }])], files: htmlFile ? [htmlFile] : [] }).catch(() => {});
                }
                if (htmlFile) await i.user.send({ embeds: [embeds.info("Transcript", `Your ticket \`${ch.name}\` has been archived \u2014 HTML transcript attached`)], files: [htmlFile] }).catch(() => {});
                if (htmlFile) await ch.send({ embeds: [embeds.info("Archived", "This ticket is now archived. HTML transcript saved.")], files: [htmlFile] }).catch(() => {});
            } catch (e) { logger.error("tickets", "archive send failed", e); }
            try { await this.prisma.ticket.update({ where: { channelId }, data: { transcript: `archived-${ch.name}.html` } }); } catch (e) { logger.error("tickets", "transcript ref save failed", e); }
        }
        await i.editReply({ embeds: [embeds.success("Closed & Archived", "Ticket archived \u2014 HTML transcript created")], components: [] }).catch(() => {});
    }

    async handleReopen(i) {
        if (!i.isButton()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (ticket.status !== STATUS.CLOSED) return i.reply({ embeds: [embeds.warn("Not closed", "Ticket is not closed.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        let updated;
        try {
            updated = await this.prisma.ticket.update({ where: { channelId }, data: { status: STATUS.OPEN, closedAt: null, closedById: null } });
        } catch (e) {
            logger.error("tickets", "reopen update failed", e);
            return i.reply({ embeds: [embeds.error("Failed", "Could not reopen ticket")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await i.reply({ embeds: [embeds.success("Reopened", "Ticket reopened")], flags: MessageFlags.Ephemeral }).catch(() => {});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
        if (ch) {
            await ch.send({ embeds: [embeds.info("Reopened", `Ticket reopened by <@${i.user.id}>`)] }).catch(() => {});
            await this.updateTicketMessage(ch, updated);
        }
    }

    async handleTranscript(i) {
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (!await this.canViewTicket(i, ticket)) {
            return i.reply({ embeds: [embeds.error("Denied", "Only the ticket opener or staff can view transcripts.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(() => null);
        if (!ch) return i.editReply({ embeds: [embeds.error("Not found", "Channel missing")] }).catch(() => {});
        try {
            const sortedMsgs = await this.fetchAllMessages(ch);
            const freshTicket = await this.prisma.ticket.findUnique({ where: { channelId } }).catch(() => ticket);
            const html = this.buildHtmlTranscript({ channel: ch, ticket: freshTicket, guild: i.guild, messages: sortedMsgs, closerId: i.user.id });
            const file = { attachment: Buffer.from(html, "utf-8"), name: `transcript-${ch.name}.html` };
            return i.editReply({ embeds: [embeds.success("Transcript", "HTML transcript")], files: [file] }).catch(() => {});
        } catch (e) {
            logger.error("tickets", "transcript generation failed", e);
            return i.editReply({ embeds: [embeds.error("Failed", "Could not generate transcript")] }).catch(() => {});
        }
    }

    // ─── Transcript ────────────────────────────────────────

    async fetchAllMessages(channel) {
        let all = [];
        let lastId = null;
        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            const batch = await channel.messages.fetch(options).catch(() => null);
            if (!batch || batch.size === 0) break;
            all.push(...batch.values());
            lastId = batch.last()?.id;
            if (batch.size < 100) break;
        }
        return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    }

    buildHtmlTranscript({ channel, ticket, guild, messages, closerId }) {
        const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const rows = messages.map(m => {
            const time = m.createdAt.toLocaleString();
            const avatar = m.author.displayAvatarURL?.() ?? "";
            const content = esc(m.content ?? "").replace(/\n/g, "<br>");
            const attachments = m.attachments?.size ? [...m.attachments.values()].map(a => `<a href="${esc(a.url)}" target="_blank">${esc(a.name ?? "attachment")}</a>`).join("<br>") : "";
            return `<div class="msg"><img class="av" src="${esc(avatar)}" onerror="this.style.display='none'"><div><div class="meta"><span class="author">${esc(m.author.tag)}</span> <span class="time">${esc(time)}</span></div><div class="content">${content || "<i>embed/attachment</i>"}${attachments ? `<div class="atts">${attachments}</div>` : ""}</div></div></div>`;
        }).join("\n");
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript \u2014 ${esc(channel.name)}</title>
<style>
body{font-family:Inter,system-ui,Arial;background:#313338;color:#dcddde;margin:0;padding:0}
.header{background:#2b2d31;padding:24px 32px;border-bottom:1px solid #232428}
.header h1{margin:0;font-size:24px;color:#fff} .header p{color:#b5bac1;margin:6px 0 0}
.container{max-width:900px;margin:0 auto;padding:24px}
.msg{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #3f4147}
.av{width:40px;height:40px;border-radius:50%;flex-shrink:0}
.meta{font-size:14px} .author{font-weight:600;color:#fff} .time{color:#949ba4;font-size:12px;margin-left:8px}
.content{margin-top:4px;white-space:pre-wrap;word-break:break-word;color:#dcddde}
.atts{margin-top:6px;font-size:12px}
.footer{padding:24px;text-align:center;color:#949ba4;font-size:12px;border-top:1px solid #232428;margin-top:24px}
.badge{display:inline-block;background:#5865f2;color:#fff;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:8px}
</style></head><body>
<div class="header"><h1>${esc(ticket?.panelType ?? "Ticket")} \u2014 ${esc(channel.name)} <span class="badge">${esc(ticket?.status ?? "CLOSED")}</span></h1><p>Guild: ${esc(guild.name)} \u2022 Ticket: ${esc(ticket?.id)} \u2022 Opener: ${esc(ticket?.openerId)} \u2022 Closed by: ${esc(closerId ?? "system")} \u2022 ${new Date().toLocaleString()}</p></div>
<div class="container"><p style="color:#b5bac1">Archived transcript \u2014 ${messages.length} messages</p>
<hr style="border:0;border-top:1px solid #3f4147;margin:16px 0">
${rows}
<div class="footer">Guild: ${esc(guild.name)} \u2022 Generated ${new Date().toISOString()}</div></div></body></html>`;
    }

    // ─── Panel Select (dropdown handler) ───────────────────

    async handlePanelSelect(interaction) {
        if (!interaction.isStringSelectMenu()) return;
        const panelType = interaction.customId.split(":")[2];
        const key = interaction.values[0];
        const guild = interaction.guild;
        const member = interaction.member;

        const cfg = await this.settings.get(guild.id).catch(() => null);
        if (cfg?.ignoredUserIds?.includes(member.id)) {
            return interaction.reply({ embeds: [embeds.error("Access denied", "You are not allowed to open tickets.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        let type = await this.prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } }).catch(() => null);
        if (!type) {
            const fallbacks = this.client?.services?.panels?.getFallbackTicketTypes(panelType) ?? [];
            const fb = fallbacks.find(f => f.key === key);
            if (fb) {
                try {
                    type = await this.prisma.ticketType.create({ data: { guildId: guild.id, panelType, key: fb.key, displayName: fb.displayName, description: fb.description, emoji: fb.emoji, enabled: true, channelPrefix: fb.key.slice(0, 10) } });
                } catch {
                    type = await this.prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } }).catch(() => null);
                }
            }
        }
        if (!type || !type.enabled) return interaction.reply({ embeds: [embeds.error("Not found", "This ticket type is not available.")], flags: MessageFlags.Ephemeral }).catch(() => {});

        const can = await this.canOpen(guild, member.id, type);
        if (!can.ok) return interaction.reply({ embeds: [embeds.warn("Cannot open ticket", can.reason)], flags: MessageFlags.Ephemeral }).catch(() => {});

        let questions = [];
        try { questions = JSON.parse(type.questions ?? "[]"); } catch {}
        if (questions.length) {
            const modal = new ModalBuilder().setCustomId(`ticket:questions:${type.key}`).setTitle(type.displayName.slice(0, 45));
            for (let idx = 0; idx < Math.min(questions.length, 5); idx++) {
                const q = questions[idx];
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`q${idx}`).setLabel(String(q.label ?? q.question ?? `Question ${idx + 1}`).slice(0, 45)).setStyle(q.style === "PARAGRAPH" ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(q.required !== false).setMaxLength(1000).setPlaceholder((q.placeholder ?? "").slice(0, 100))));
            }
            return interaction.showModal(modal).catch(() => {});
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const ticket = await this.createTicket(guild, member, type, []);
        await interaction.editReply({ embeds: [embeds.success("Ticket created", `Your ticket is ready: <#${ticket.channelId}>`)] }).catch(() => {});
    }

    async handleQuestionModal(interaction) {
        if (!interaction.isModalSubmit()) return;
        const key = interaction.customId.split(":")[2];
        const guild = interaction.guild;
        const member = interaction.member;
        const type = await this.prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } }).catch(() => null);
        if (!type) return interaction.reply({ embeds: [embeds.error("Not found", "Type missing")], flags: MessageFlags.Ephemeral }).catch(() => {});
        let questions = [];
        try { questions = JSON.parse(type.questions ?? "[]"); } catch {}
        const answers = [];
        for (let idx = 0; idx < Math.min(questions.length, 5); idx++) {
            const q = questions[idx];
            const ans = interaction.fields.getTextInputValue(`q${idx}`) ?? "";
            answers.push({ question: q.label ?? q.question ?? `Q${idx + 1}`, answer: ans });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const ticket = await this.createTicket(guild, member, type, answers);
        await interaction.editReply({ embeds: [embeds.success("Ticket created", `Your ticket: <#${ticket.channelId}>`)] }).catch(() => {});
    }

    async handleDashboardSelect(i) {
        if (!i.isStringSelectMenu()) return;
        const val = i.values[0];
        const map = {
            about: "Each server configures its own content via /config.",
            services: "Use the Orders and Assistance panels to open tickets.",
            staff: "Staff listed via server roles \u2014 configure via /config.",
            links: "Invite .pulse: https://discord.com/oauth2/authorize?client_id=" + (process.env.CLIENT_ID ?? "") + "&scope=bot%20applications.commands",
            regulations: "See the Regulations panel for server rules.",
        };
        await i.reply({ embeds: [embeds.info(val, map[val] ?? "More information coming soon.")], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // ─── Auto-deletion ─────────────────────────────────────

    async getDeletionDelayMs(guildId) {
        try {
            const cfg = await this.settings.get(guildId).catch(() => null);
            const orders = cfg?.orders || {};
            if (typeof orders.deletionDelayMs === "number" && orders.deletionDelayMs >= 60_000 && orders.deletionDelayMs <= 7 * 24 * 3600_000) return orders.deletionDelayMs;
            const panel = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType: "ORDER" } } }).catch(() => null);
            if (panel) {
                try {
                    const pc = JSON.parse(panel.config ?? "{}");
                    if (typeof pc.deletionDelayMs === "number") return pc.deletionDelayMs;
                } catch {}
            }
        } catch {}
        return 10 * 60 * 1000;
    }

    async checkDeletions() {
        try {
            const allClosed = await this.prisma.ticket.findMany({ where: { status: STATUS.CLOSED, closedAt: { not: null } }, take: 100 }).catch(() => []);
            const now = Date.now();
            for (const t of allClosed) {
                if (!t.closedAt) continue;
                const delay = await this.getDeletionDelayMs(t.guildId);
                if (now < new Date(t.closedAt).getTime() + delay) continue;
                const guild = this.client.guilds.cache.get(t.guildId);
                if (!guild) continue;
                const ch = guild.channels.cache.get(t.channelId) ?? await guild.channels.fetch(t.channelId).catch(() => null);
                if (!ch) continue;
                const me = guild.members.me;
                if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    logger.warn("tickets", `cannot auto-delete ${t.channelId} \u2014 missing ManageChannels`);
                    continue;
                }
                const isArchived = ch.name.startsWith("archived-") || ch.parent?.name?.toLowerCase().includes("archive");
                if (!isArchived) continue;
                try {
                    await ch.delete(`Auto-deletion after ${Math.round(delay / 60000)}m \u2014 ticket ${t.id}`);
                    logger.info("tickets", `auto-deleted archived ticket ${t.channelId} in ${t.guildId}`);
                } catch (e) {
                    logger.error("tickets", "auto-delete failed", e);
                }
            }
        } catch (e) { logger.error("tickets", "checkDeletions outer failed", e); }
    }

    // ─── Query ─────────────────────────────────────────────

    async listTickets(guildId, { status = null, category = null, userId = null, limit = 10, offset = 0 } = {}) {
        const where = { guildId };
        if (status) where.status = status;
        if (category) where.panelType = category;
        if (userId) where.openerId = userId;
        const [rows, total] = await Promise.all([
            this.prisma.ticket.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(limit, 25), skip: offset }).catch(() => []),
            this.prisma.ticket.count({ where }).catch(() => 0),
        ]);
        const typeIds = [...new Set(rows.map(r => r.typeId).filter(Boolean))];
        const types = typeIds.length ? await this.prisma.ticketType.findMany({ where: { id: { in: typeIds } } }).catch(() => []) : [];
        const typeMap = new Map(types.map(t => [t.id, t]));
        return {
            rows: rows.map(r => {
                const t = r.typeId ? typeMap.get(r.typeId) : null;
                return { ...r, category: t?.displayName || r.panelType || "Ticket", shortId: r.id.slice(0, 4).toLowerCase() };
            }),
            total,
        };
    }

    async getTicketStats(guildId) {
        const [open, closed, claimed] = await Promise.all([
            this.prisma.ticket.count({ where: { guildId, status: { not: STATUS.CLOSED } } }).catch(() => 0),
            this.prisma.ticket.count({ where: { guildId, status: STATUS.CLOSED } }).catch(() => 0),
            this.prisma.ticket.count({ where: { guildId, status: STATUS.CLAIMED } }).catch(() => 0),
        ]);
        return { open, closed, claimed, total: open + closed };
    }
}

// ─── Handler Registration ──────────────────────────────────

export function registerTicketHandlers(client, ticketService) {
    const c = client.components;
    const h = (id, fn) => { c.set(id, fn); };
    h("panel:select", i => ticketService.handlePanelSelect(i));
    h("panel:dashboard", i => ticketService.handleDashboardSelect(i));
    h("ticket:questions", i => ticketService.handleQuestionModal(i));
    h("ticket:claim", i => ticketService.handleClaim(i));
    h("ticket:unclaim", i => ticketService.handleUnclaim(i));
    h("ticket:status", i => ticketService.handleStatusSelect(i));
    h("ticket:priority", i => ticketService.handlePrioritySelect(i));
    h("ticket:add", i => ticketService.handleAddUser(i));
    h("ticket:remove", i => ticketService.handleRemoveUser(i));
    h("ticket:info", i => ticketService.handleInfo(i));
    h("ticket:close", i => ticketService.handleClose(i));
    h("ticket:reopen", i => ticketService.handleReopen(i));
    h("ticket:transcript", i => ticketService.handleTranscript(i));
    logger.info("tickets", "Ticket handlers registered");
}
