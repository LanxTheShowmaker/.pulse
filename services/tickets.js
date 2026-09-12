import { EmbedBuilder } from "@discordjs/builders";
import { ChannelType, PermissionFlagsBits, MessageFlags, ButtonStyle } from "discord.js";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";
import { button, row } from "../ui/components.js";

const VALID_STATUSES = ["OPEN", "CLAIMED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
const VALID_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const VALID_TRANSITIONS = {
    OPEN: ["CLAIMED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"],
    CLAIMED: ["IN_PROGRESS", "WAITING", "OPEN", "RESOLVED", "CLOSED"],
    IN_PROGRESS: ["WAITING", "RESOLVED", "CLAIMED", "CLOSED"],
    WAITING: ["IN_PROGRESS", "OPEN", "RESOLVED", "CLOSED"],
    RESOLVED: ["CLOSED", "IN_PROGRESS"],
    CLOSED: ["IN_PROGRESS"],
};

export class TicketService {
    constructor(prisma, client, settings, logging) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
        this.logging = logging;
    }

    // ─── CREATE ────────────────────────────────────────────

    async create(guild, channel, opener, type, formAnswers) {
        const ticket = await this.prisma.ticket.create({
            data: {
                guildId: guild.id,
                channelId: channel.id,
                openerId: opener.id,
                typeId: type?.id ?? null,
                panelType: type?.panelType ?? "default",
                status: "OPEN",
                priority: type?.priority ?? "NORMAL",
            },
        });

        await this.log(guild.id, ticket.id, "CREED", opener.id);

        if (formAnswers && Object.keys(formAnswers).length > 0) {
            await this.prisma.ticketFormResponse.create({
                data: {
                    guildId: guild.id,
                    ticketId: ticket.id,
                    questions: JSON.stringify(type?.formQuestions ? JSON.parse(type.formQuestions) : []),
                    answers: JSON.stringify(formAnswers),
                },
            });
        }

        this.client.services.achievements?.increment(guild.id, opener.id, "ticketsOpened").catch(() => {});

        return ticket;
    }

    // ─── PERMISSIONS ───────────────────────────────────────

    async applyPermissions(channel, guild, opener, type) {
        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false });
        await channel.permissionOverwrites.edit(opener.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        });

        if (type?.staffRoleIds) {
            const staffIds = JSON.parse(type.staffRoleIds || "[]");
            for (const id of staffIds) {
                await channel.permissionOverwrites.edit(id, {
                    ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
                }).catch(() => {});
            }
        }

        if (type?.moderatorRoleIds) {
            const modIds = JSON.parse(type.moderatorRoleIds || "[]");
            for (const id of modIds) {
                await channel.permissionOverwrites.edit(id, {
                    ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
                    ManageMessages: true,
                }).catch(() => {});
            }
        }
    }

    // ─── CLAIM ─────────────────────────────────────────────

    async claim(ticketId, userId) {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error("Ticket not found");
        if (!["OPEN", "WAITING"].includes(ticket.status)) throw new Error(`Cannot claim ticket in ${ticket.status} status`);

        const updated = await this.prisma.ticket.update({
            where: { id: ticketId },
            data: { claimedById: userId, status: "CLAIMED", assignedById: userId, assignedAt: new Date() },
        });

        await this.log(ticket.guildId, ticketId, "CLAIMED", userId);
        return updated;
    }

    // ─── ASSIGN ────────────────────────────────────────────

    async assign(ticketId, userId, assignedBy) {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error("Ticket not found");

        const updated = await this.prisma.ticket.update({
            where: { id: ticketId },
            data: { assignedById: userId, assignedAt: new Date() },
        });

        await this.log(ticket.guildId, ticketId, "ASSIGNED", assignedBy, `Assigned to <@${userId}>`);
        return updated;
    }

    // ─── UNASSIGN ──────────────────────────────────────────

    async unassign(ticketId, unassignedBy) {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error("Ticket not found");

        const updated = await this.prisma.ticket.update({
            where: { id: ticketId },
            data: { assignedById: null, assignedAt: null, claimedById: ticket.claimedById === ticket.assignedById ? null : ticket.claimedById },
        });

        await this.log(ticket.guildId, ticketId, "UNASSIGNED", unassignedBy);
        return updated;
    }

    // ─── STATUS ────────────────────────────────────────────

    async setStatus(ticketId, newStatus, changedBy) {
        if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

        const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error("Ticket not found");

        const allowed = VALID_TRANSITIONS[ticket.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Cannot transition from ${ticket.status} to ${newStatus}`);
        }

        const data = { status: newStatus };
        if (newStatus === "RESOLVED") data.closedById = changedBy;
        if (newStatus === "CLOSED") data.closedAt = new Date();

        const updated = await this.prisma.ticket.update({ where: { id: ticketId }, data });
        await this.log(ticket.guildId, ticketId, "STATUS_CHANGED", changedBy, `${ticket.status} → ${newStatus}`);
        return updated;
    }

    // ─── PRIORITY ──────────────────────────────────────────

    async setPriority(ticketId, newPriority, changedBy) {
        if (!VALID_PRIORITIES.includes(newPriority)) throw new Error(`Invalid priority: ${newPriority}`);

        const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error("Ticket not found");

        const updated = await this.prisma.ticket.update({
            where: { id: ticketId },
            data: { priority: newPriority },
        });

        await this.log(ticket.guildId, ticketId, "PRIORITY_CHANGED", changedBy, `${ticket.priority} → ${newPriority}`);
        return updated;
    }

    // ─── NOTES ─────────────────────────────────────────────

    async addNote(ticketId, authorId, content) {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) throw new Error("Ticket not found");

        const note = await this.prisma.ticketNote.create({
            data: { guildId: ticket.guildId, ticketId, authorId, content },
        });

        await this.log(ticket.guildId, ticketId, "NOTE_ADDED", authorId);
        return note;
    }

    async getNotes(ticketId) {
        return this.prisma.ticketNote.findMany({
            where: { ticketId },
            orderBy: { createdAt: "asc" },
        });
    }

    async deleteNote(noteId) {
        return this.prisma.ticketNote.delete({ where: { id: noteId } });
    }

    // ─── HISTORY ───────────────────────────────────────────

    async log(guildId, ticketId, event, actorId, details) {
        await this.prisma.ticketHistory.create({
            data: { guildId, ticketId, event, actorId: actorId ?? null, details: details ?? null },
        }).catch(e => logger.error("tickets", `history log failed: ${e.message}`));
    }

    async getHistory(ticketId) {
        return this.prisma.ticketHistory.findMany({
            where: { ticketId },
            orderBy: { createdAt: "asc" },
        });
    }

    // ─── CLOSE ─────────────────────────────────────────────

    async close(channelId, closedById) {
        const ticket = await this.prisma.ticket.findUnique({ where: { channelId } });
        if (!ticket) return null;

        const guild = this.client.guilds.cache.get(ticket.guildId);
        let transcript = null;

        if (guild) {
            const ch = guild.channels.cache.get(channelId);
            if (ch?.isTextBased()) {
                transcript = await this.buildTranscript(ch).catch(e => {
                    logger.error("tickets", `transcript failed for ${channelId}: ${e.message}`);
                    return null;
                });

                if (!transcript) {
                    const errEmbed = new EmbedBuilder()
                        .setColor(Theme.danger)
                        .setTitle("Transcript Failed")
                        .setDescription("Could not generate transcript. The channel will still be closed.")
                        .setFooter({ text: Brand.footer });
                    await ch.send({ embeds: [errEmbed] }).catch(() => {});
                }
            }
        }

        await this.prisma.ticket.update({
            where: { channelId },
            data: { status: "CLOSED", closedById, closedAt: new Date(), transcript },
        });

        await this.log(ticket.guildId, ticket.id, "CLOSED", closedById);

        if (guild) {
            const ch = guild.channels.cache.get(channelId);
            if (ch) {
                const ratingEmbed = new EmbedBuilder()
                    .setColor(Theme.info)
                    .setTitle("Rate this ticket")
                    .setDescription("How was your support experience?")
                    .setFooter({ text: Brand.footer });

                const ratingButtons = [];
                for (let s = 1; s <= 5; s++) {
                    ratingButtons.push(
                        button(`${"⭐".repeat(s)}`, `ticketrate:${ticket.id}:${s}`, ButtonStyle.Secondary)
                    );
                }

                const closeEmbed = new EmbedBuilder()
                    .setColor(Theme.muted)
                    .setTitle("Ticket Closed")
                    .setDescription(`Closed by <@${closedById}>. Channel will be deleted in 60 seconds.`)
                    .setFooter({ text: Brand.footer })
                    .setTimestamp();

                await ch.send({ embeds: [ratingEmbed], components: [row(...ratingButtons)] }).catch(() => {});
                await ch.send({ embeds: [closeEmbed] }).catch(() => {});
                setTimeout(() => ch.delete().catch(() => {}), 60_000);
            }
        }

        return { ...ticket, transcript };
    }

    // ─── REOPEN ────────────────────────────────────────────

    async reopen(channelId, reopenedBy) {
        const ticket = await this.prisma.ticket.findUnique({ where: { channelId } });
        if (!ticket) throw new Error("Ticket not found");
        if (ticket.status !== "CLOSED") throw new Error("Only closed tickets can be reopened");

        const updated = await this.prisma.ticket.update({
            where: { channelId },
            data: { status: "OPEN", closedAt: null, closedById: null, transcript: null },
        });

        await this.log(ticket.guildId, ticket.id, "REOPENED", reopenedBy);
        return updated;
    }

    // ─── RATING ────────────────────────────────────────────

    async rate(ticketId, channelId, guildId, raterId, rating, feedback) {
        const existing = await this.prisma.ticketRating.findUnique({
            where: { guildId_channelId_raterId: { guildId, channelId, raterId } },
        });

        if (existing) {
            return this.prisma.ticketRating.update({
                where: { id: existing.id },
                data: { rating, feedback: feedback || null },
            });
        }

        return this.prisma.ticketRating.create({
            data: { guildId, channelId, raterId, rating, feedback: feedback || null },
        });
    }

    // ─── TRANSCRIPT ────────────────────────────────────────

    async buildTranscript(channel) {
        const messages = [];
        let lastId;
        while (true) {
            const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
            if (!batch?.size) break;
            for (const msg of batch.values()) {
                messages.push({
                    author: msg.author.tag,
                    authorId: msg.author.id,
                    content: msg.content,
                    timestamp: msg.createdAt.toISOString(),
                    attachments: msg.attachments.map(a => ({ name: a.name, url: a.url })),
                });
            }
            lastId = batch.last()?.id;
            if (batch.size < 100) break;
        }
        messages.reverse();

        const ticket = await this.prisma.ticket.findUnique({ where: { channelId: channel.id } });
        const history = ticket ? await this.getHistory(ticket.id) : [];
        const notes = ticket ? await this.getNotes(ticket.id) : [];
        const formResponse = ticket ? await this.prisma.ticketFormResponse.findUnique({
            where: { guildId_ticketId: { guildId: ticket.guildId, ticketId: ticket.id } },
        }) : null;

        return JSON.stringify({
            ticket: ticket ? {
                id: ticket.id,
                guildId: ticket.guildId,
                openerId: ticket.openerId,
                typeId: ticket.typeId,
                status: ticket.status,
                priority: ticket.priority,
                claimedById: ticket.claimedById,
                assignedById: ticket.assignedById,
                closedById: ticket.closedById,
                createdAt: ticket.createdAt?.toISOString(),
                closedAt: ticket.closedAt?.toISOString(),
            } : null,
            messages,
            history: history.map(h => ({
                event: h.event,
                actorId: h.actorId,
                details: h.details,
                timestamp: h.createdAt?.toISOString(),
            })),
            notes: notes.map(n => ({
                authorId: n.authorId,
                content: n.content,
                timestamp: n.createdAt?.toISOString(),
            })),
            formResponse: formResponse ? {
                questions: JSON.parse(formResponse.questions || "[]"),
                answers: JSON.parse(formResponse.answers || "{}"),
            } : null,
        });
    }

    // ─── QUERIES ───────────────────────────────────────────

    async getStats(guildId) {
        const open = await this.prisma.ticket.count({ where: { guildId, status: { notIn: ["CLOSED"] } } });
        const closed = await this.prisma.ticket.count({ where: { guildId, status: "CLOSED" } });
        const avg = await this.prisma.ticketRating.aggregate({
            where: { guildId },
            _avg: { rating: true },
            _count: { rating: true },
        });
        return { open, closed, total: open + closed, avgRating: avg._avg.rating, ratedCount: avg._count.rating };
    }

    async listOpen(guildId, limit = 15) {
        return this.prisma.ticket.findMany({
            where: { guildId, status: { notIn: ["CLOSED"] } },
            orderBy: [
                { priority: "asc" },
                { createdAt: "desc" },
            ],
            take: limit,
        });
    }

    async getByChannel(channelId) {
        return this.prisma.ticket.findUnique({ where: { channelId } });
    }

    async getById(ticketId) {
        return this.prisma.ticket.findUnique({ where: { id: ticketId } });
    }

    async getOpenByUser(guildId, userId) {
        return this.prisma.ticket.findFirst({
            where: { guildId, openerId: userId, status: { notIn: ["CLOSED"] } },
        });
    }

    async getOpenByTypeAndUser(guildId, typeId, userId) {
        return this.prisma.ticket.findFirst({
            where: { guildId, typeId, openerId: userId, status: { notIn: ["CLOSED"] } },
        });
    }

    async countOpenByType(guildId, typeId) {
        return this.prisma.ticket.count({
            where: { guildId, typeId, status: { notIn: ["CLOSED"] } },
        });
    }

    // ─── AUTO-CLOSE CHECK ─────────────────────────────────

    async checkAutoClose() {
        const staleTickets = await this.prisma.ticket.findMany({
            where: { status: { in: ["OPEN", "CLAIMED", "IN_PROGRESS", "WAITING"] } },
            include: { TicketType: true },
        });

        for (const ticket of staleTickets) {
            const autoCloseMin = ticket.TicketType?.autoCloseMinutes ?? 30;
            if (autoCloseMin <= 0) continue;

            const cutoff = new Date(Date.now() - autoCloseMin * 60_000);
            if (ticket.lastMessageAt && ticket.lastMessageAt < cutoff) {
                const guild = this.client.guilds.cache.get(ticket.guildId);
                const ch = guild?.channels.cache.get(ticket.channelId);
                if (ch?.isTextBased()) {
                    const warnEmbed = new EmbedBuilder()
                        .setColor(Theme.warn)
                        .setTitle("Auto-close warning")
                        .setDescription(`No activity for ${autoCloseMin} minutes. This ticket will close in 5 minutes unless there is a response.`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await ch.send({ embeds: [warnEmbed] }).catch(() => {});
                }
            }

            const warningCutoff = new Date(Date.now() - (autoCloseMin + 5) * 60_000);
            if (ticket.lastMessageAt && ticket.lastMessageAt < warningCutoff) {
                await this.close(ticket.channelId, this.client.user?.id).catch(e => {
                    logger.error("tickets", `auto-close failed for ${ticket.channelId}: ${e.message}`);
                });
            }
        }
    }

    // ─── VALIDATORS ────────────────────────────────────────

    canTransition(from, to) {
        return VALID_TRANSITIONS[from]?.includes(to) ?? false;
    }

    isValidStatus(s) {
        return VALID_STATUSES.includes(s);
    }

    isValidPriority(p) {
        return VALID_PRIORITIES.includes(p);
    }
}
