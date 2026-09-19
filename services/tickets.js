import { EmbedBuilder } from "@discordjs/builders";
import { ChannelType, PermissionFlagsBits, MessageFlags, ButtonStyle } from "discord.js";
import { eq, and, desc, asc, count, avg, ne, inArray } from "drizzle-orm";
import {
    ticket, ticketType, ticketNote, ticketHistory, ticketFormResponse,
    ticketRating, case_ as caseTable, caseNote, guildConfig, panel,
} from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
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
    constructor(db, client, settings, logging) {
        this.db = db;
        this.client = client;
        this.settings = settings;
        this.logging = logging;
    }

    async findById(ticketId) {
        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    async findByChannel(channelId) {
        return one(await this.db.select().from(ticket).where(eq(ticket.channelId, channelId)).limit(1));
    }

    // ─── CREATE ────────────────────────────────────────────

    async create(guild, channel, opener, type, formAnswers) {
        const id = uuid();
        await this.db.insert(ticket).values(clean({
            id,
            guildId: guild.id,
            channelId: channel.id,
            openerId: opener.id,
            typeId: type?.id ?? null,
            panelType: type?.panelType ?? "default",
            status: "OPEN",
            priority: type?.priority ?? "NORMAL",
        }));
        const row = one(await this.db.select().from(ticket).where(eq(ticket.id, id)));

        await this.log(guild.id, row.id, "CREED", opener.id);

        if (formAnswers && Object.keys(formAnswers).length > 0) {
            await this.db.insert(ticketFormResponse).values({
                guildId: guild.id,
                ticketId: row.id,
                questions: JSON.stringify(type?.formQuestions ? JSON.parse(type.formQuestions) : []),
                answers: JSON.stringify(formAnswers),
            });
        }

        this.client.services.achievements?.increment(guild.id, opener.id, "ticketsOpened").catch(() => {});

        return row;
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
        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");
        if (!["OPEN", "WAITING"].includes(row.status)) throw new Error(`Cannot claim ticket in ${row.status} status`);

        await this.db.update(ticket)
            .set({ claimedById: userId, status: "CLAIMED", assignedById: userId, assignedAt: new Date() })
            .where(eq(ticket.id, ticketId));

        await this.log(row.guildId, ticketId, "CLAIMED", userId);
        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    // ─── ASSIGN ────────────────────────────────────────────

    async assign(ticketId, userId, assignedBy) {
        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");

        await this.db.update(ticket)
            .set({ assignedById: userId, assignedAt: new Date() })
            .where(eq(ticket.id, ticketId));

        await this.log(row.guildId, ticketId, "ASSIGNED", assignedBy, `Assigned to <@${userId}>`);
        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    // ─── UNASSIGN ──────────────────────────────────────────

    async unassign(ticketId, unassignedBy) {
        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");

        await this.db.update(ticket)
            .set({ assignedById: null, assignedAt: null, claimedById: row.claimedById === row.assignedById ? null : row.claimedById })
            .where(eq(ticket.id, ticketId));

        await this.log(row.guildId, ticketId, "UNASSIGNED", unassignedBy);
        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    // ─── STATUS ────────────────────────────────────────────

    async setStatus(ticketId, newStatus, changedBy) {
        if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");

        const allowed = VALID_TRANSITIONS[row.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Cannot transition from ${row.status} to ${newStatus}`);
        }

        const data = { status: newStatus };
        if (newStatus === "RESOLVED") data.closedById = changedBy;
        if (newStatus === "CLOSED") data.closedAt = new Date();

        await this.db.update(ticket).set(data).where(eq(ticket.id, ticketId));
        await this.log(row.guildId, ticketId, "STATUS_CHANGED", changedBy, `${row.status} → ${newStatus}`);
        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    // ─── PRIORITY ──────────────────────────────────────────

    async setPriority(ticketId, newPriority, changedBy) {
        if (!VALID_PRIORITIES.includes(newPriority)) throw new Error(`Invalid priority: ${newPriority}`);

        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");

        await this.db.update(ticket).set({ priority: newPriority }).where(eq(ticket.id, ticketId));

        await this.log(row.guildId, ticketId, "PRIORITY_CHANGED", changedBy, `${row.priority} → ${newPriority}`);
        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    // ─── NOTES ─────────────────────────────────────────────

    async addNote(ticketId, authorId, content) {
        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");

        const id = uuid();
        await this.db.insert(ticketNote).values({
            id, guildId: row.guildId, ticketId, authorId, content,
        });

        await this.log(row.guildId, ticketId, "NOTE_ADDED", authorId);
        return one(await this.db.select().from(ticketNote).where(eq(ticketNote.id, id)));
    }

    async getNotes(ticketId) {
        return this.db.select().from(ticketNote)
            .where(eq(ticketNote.ticketId, ticketId))
            .orderBy(asc(ticketNote.createdAt));
    }

    async deleteNote(noteId) {
        const row = one(await this.db.select().from(ticketNote).where(eq(ticketNote.id, noteId)).limit(1));
        if (!row) return null;
        await this.db.delete(ticketNote).where(eq(ticketNote.id, noteId));
        return row;
    }

    // ─── HISTORY ───────────────────────────────────────────

    async log(guildId, ticketId, event, actorId, details) {
        await this.db.insert(ticketHistory).values({
            guildId, ticketId, event, actorId: actorId ?? null, details: details ?? null,
        }).catch(e => logger.error("tickets", `history log failed: ${e.message}`));
    }

    async getHistory(ticketId) {
        return this.db.select().from(ticketHistory)
            .where(eq(ticketHistory.ticketId, ticketId))
            .orderBy(asc(ticketHistory.createdAt));
    }

    // ─── RENAME ────────────────────────────────────────────

    async rename(ticketId, newName, renamedBy) {
        const row = await this.findById(ticketId);
        if (!row) throw new Error("Ticket not found");

        await this.db.update(ticket)
            .set({ customName: newName || null })
            .where(eq(ticket.id, ticketId));

        await this.log(row.guildId, ticketId, "RENAMED", renamedBy, newName ? `Renamed to "${newName}"` : "Name cleared");

        const guild = this.client.guilds.cache.get(row.guildId);
        if (guild) {
            const ch = guild.channels.cache.get(row.channelId);
            if (ch) {
                const displayName = newName || ch.name.replace(/^ticket-/, "");
                const prefix = displayName.startsWith("ticket-") ? "" : "ticket-";
                await ch.setName(`${prefix}${displayName}`.slice(0, 100)).catch(() => {});
            }
        }

        return one(await this.db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    }

    // ─── WORKSPACE MESSAGE ─────────────────────────────────

    async setWorkspaceMessage(channelId, messageId) {
        await this.db.update(ticket)
            .set({ workspaceMessageId: messageId })
            .where(eq(ticket.channelId, channelId)).catch(() => {});
    }

    // ─── CLOSE ─────────────────────────────────────────────

    async close(channelId, closedById, closeReason) {
        const row = await this.findByChannel(channelId);
        if (!row) return null;

        const guild = this.client.guilds.cache.get(row.guildId);
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

        await this.db.update(ticket)
            .set({ status: "CLOSED", closedById, closedAt: new Date(), transcript, closeReason: closeReason || null })
            .where(eq(ticket.channelId, channelId));

        await this.log(row.guildId, row.id, "CLOSED", closedById, closeReason || null);

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
                        button(`${"⭐".repeat(s)}`, `ticketrate:${row.id}:${s}`, ButtonStyle.Secondary)
                    );
                }

                const closeEmbed = new EmbedBuilder()
                    .setColor(Theme.muted)
                    .setTitle("Ticket Closed")
                    .setDescription(`Closed by <@${closedById}>${closeReason ? `\n**Reason:** ${closeReason}` : ""}\nChannel will be deleted in 60 seconds.`)
                    .setFooter({ text: Brand.footer })
                    .setTimestamp();

                await ch.send({ embeds: [ratingEmbed], components: [row(...ratingButtons)] }).catch(() => {});
                await ch.send({ embeds: [closeEmbed] }).catch(() => {});
                setTimeout(() => ch.delete().catch(() => {}), 60_000);
            }
        }

        const fresh = await this.findByChannel(channelId);
        return { ...fresh, transcript };
    }

    // ─── REOPEN ────────────────────────────────────────────

    async reopen(channelId, reopenedBy) {
        const row = await this.findByChannel(channelId);
        if (!row) throw new Error("Ticket not found");
        if (row.status !== "CLOSED") throw new Error("Only closed tickets can be reopened");

        await this.db.update(ticket)
            .set({ status: "OPEN", closedAt: null, closedById: null, transcript: null })
            .where(eq(ticket.channelId, channelId));

        await this.log(row.guildId, row.id, "REOPENED", reopenedBy);
        return one(await this.db.select().from(ticket).where(eq(ticket.channelId, channelId)).limit(1));
    }

    // ─── RATING ────────────────────────────────────────────

    async rate(ticketId, channelId, guildId, raterId, rating, feedback) {
        const existing = one(await this.db.select().from(ticketRating)
            .where(and(
                eq(ticketRating.guildId, guildId),
                eq(ticketRating.channelId, channelId),
                eq(ticketRating.raterId, raterId),
            )).limit(1));

        if (existing) {
            await this.db.update(ticketRating)
                .set({ rating, feedback: feedback || null })
                .where(eq(ticketRating.id, existing.id));
            return one(await this.db.select().from(ticketRating).where(eq(ticketRating.id, existing.id)).limit(1));
        }

        const id = uuid();
        await this.db.insert(ticketRating).values({
            id, guildId, channelId, raterId, rating, feedback: feedback || null,
        });
        return one(await this.db.select().from(ticketRating).where(eq(ticketRating.id, id)));
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

        const row = await this.findByChannel(channel.id);
        const history = row ? await this.getHistory(row.id) : [];
        const notes = row ? await this.getNotes(row.id) : [];
        const formResponse = row ? one(await this.db.select().from(ticketFormResponse)
            .where(and(eq(ticketFormResponse.guildId, row.guildId), eq(ticketFormResponse.ticketId, row.id))).limit(1)) : null;

        return JSON.stringify({
            ticket: row ? {
                id: row.id,
                guildId: row.guildId,
                openerId: row.openerId,
                typeId: row.typeId,
                status: row.status,
                priority: row.priority,
                claimedById: row.claimedById,
                assignedById: row.assignedById,
                closedById: row.closedById,
                createdAt: row.createdAt?.toISOString(),
                closedAt: row.closedAt?.toISOString(),
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
        const openRows = await this.db.select({ n: count() }).from(ticket)
            .where(and(eq(ticket.guildId, guildId), ne(ticket.status, "CLOSED")));
        const closedRows = await this.db.select({ n: count() }).from(ticket)
            .where(and(eq(ticket.guildId, guildId), eq(ticket.status, "CLOSED")));
        const aggRows = await this.db.select({ a: avg(ticketRating.rating), c: count() }).from(ticketRating)
            .where(eq(ticketRating.guildId, guildId));
        const open = Number(openRows[0]?.n ?? 0);
        const closed = Number(closedRows[0]?.n ?? 0);
        const avgRaw = aggRows[0]?.a;
        return {
            open,
            closed,
            total: open + closed,
            avgRating: avgRaw == null ? null : Number(avgRaw),
            ratedCount: Number(aggRows[0]?.c ?? 0),
        };
    }

    async listOpen(guildId, limit = 15) {
        return this.db.select().from(ticket)
            .where(and(eq(ticket.guildId, guildId), ne(ticket.status, "CLOSED")))
            .orderBy(asc(ticket.priority), desc(ticket.createdAt)).limit(limit);
    }

    async getByChannel(channelId) {
        return this.findByChannel(channelId);
    }

    async getById(ticketId) {
        return this.findById(ticketId);
    }

    async getOpenByUser(guildId, userId) {
        return one(await this.db.select().from(ticket)
            .where(and(eq(ticket.guildId, guildId), eq(ticket.openerId, userId), ne(ticket.status, "CLOSED")))
            .limit(1));
    }

    async getOpenByTypeAndUser(guildId, typeId, userId) {
        return one(await this.db.select().from(ticket)
            .where(and(
                eq(ticket.guildId, guildId),
                eq(ticket.typeId, typeId),
                eq(ticket.openerId, userId),
                ne(ticket.status, "CLOSED"),
            )).limit(1));
    }

    async countOpenByType(guildId, typeId) {
        const rows = await this.db.select({ n: count() }).from(ticket)
            .where(and(
                eq(ticket.guildId, guildId),
                eq(ticket.typeId, typeId),
                ne(ticket.status, "CLOSED"),
            ));
        return Number(rows[0]?.n ?? 0);
    }

    // ─── AUTO-CLOSE CHECK ─────────────────────────────────

    async checkAutoClose() {
        const staleTickets = await this.db.select().from(ticket)
            .where(inArray(ticket.status, ["OPEN", "CLAIMED", "IN_PROGRESS", "WAITING"]));

        for (const row of staleTickets) {
            let autoCloseMin = 30;

            if (row.typeId) {
                const ttype = one(await this.db.select().from(ticketType)
                    .where(eq(ticketType.id, row.typeId)).limit(1));

                autoCloseMin = ttype?.autoCloseMinutes ?? 30;
            }
            if (autoCloseMin <= 0) continue;

            const cutoff = new Date(Date.now() - autoCloseMin * 60_000);
            if (row.lastMessageAt && row.lastMessageAt < cutoff) {
                const guild = this.client.guilds.cache.get(row.guildId);
                const ch = guild?.channels.cache.get(row.channelId);
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
            if (row.lastMessageAt && row.lastMessageAt < warningCutoff) {
                await this.close(row.channelId, this.client.user?.id).catch(e => {
                    logger.error("tickets", `auto-close failed for ${row.channelId}: ${e.message}`);
                });
            }
        }
    }

    // ─── API BOUNDARY: Ticket Summaries ─────────────────────

    async getTicketSummary(ticketId) {
        const row = await this.findById(ticketId);
        if (!row) return null;
        return {
            id: row.id,
            guildId: row.guildId,
            channelId: row.channelId,
            typeId: row.typeId,
            status: row.status,
            priority: row.priority,
            openerId: row.openerId,
            claimedById: row.claimedById,
            assignedById: row.assignedById,
            closedById: row.closedById,
            closeReason: row.closeReason,
            createdAt: row.createdAt,
            closedAt: row.closedAt,
        };
    }

    async getOpenTicketsSummary(guildId, limit = 50) {
        const rows = await this.db.select().from(ticket)
            .where(and(eq(ticket.guildId, guildId), ne(ticket.status, "CLOSED")))
            .orderBy(asc(ticket.priority), desc(ticket.createdAt)).limit(limit);
        return rows.map(t => ({
            id: t.id,
            guildId: t.guildId,
            channelId: t.channelId,
            typeId: t.typeId,
            status: t.status,
            priority: t.priority,
            openerId: t.openerId,
            claimedById: t.claimedById,
            assignedById: t.assignedById,
            closeReason: t.closeReason,
            createdAt: t.createdAt,
        }));
    }

    async getTicketHistorySummary(guildId, limit = 50) {
        const rows = await this.db.select().from(ticket)
            .where(eq(ticket.guildId, guildId))
            .orderBy(desc(ticket.closedAt)).limit(limit);

        return Promise.all(
            rows.map(async t => {
                let type = null;

                if (t.typeId) {
                    const ttype = one(await this.db.select({
                        displayName: ticketType.displayName,
                        key: ticketType.key,
                    }).from(ticketType).where(eq(ticketType.id, t.typeId)).limit(1));

                    if (ttype) {
                        type = {
                            displayName: ttype.displayName,
                            key: ttype.key,
                        };
                    }
                }

                return {
                    id: t.id,
                    guildId: t.guildId,
                    type,
                    status: t.status,
                    closedAt: t.closedAt,
                    closeReason: t.closeReason,
                    openedAt: t.createdAt,
                };
            })
        );
    }

    // ─── API BOUNDARY: Moderation Cases ──────────────────────

    async getRecentCases(guildId, limit = 25) {
        return this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            resolvedById: caseTable.resolvedById,
            resolvedByTag: caseTable.resolvedByTag,
            resolvedAt: caseTable.resolvedAt,
            createdAt: caseTable.createdAt,
        }).from(caseTable).where(eq(caseTable.guildId, guildId))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async getCase(guildId, caseNumber) {
        return one(await this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            moderatorId: caseTable.moderatorId,
            moderatorTag: caseTable.moderatorTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            resolvedById: caseTable.resolvedById,
            resolvedByTag: caseTable.resolvedByTag,
            resolvedAt: caseTable.resolvedAt,
            metadata: caseTable.metadata,
            createdAt: caseTable.createdAt,
        }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber))).limit(1));
    }

    async getCasesByTarget(guildId, targetId, limit = 25) {
        return this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            createdAt: caseTable.createdAt,
        }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.targetId, targetId)))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async getCaseNotes(guildId, targetId, limit = 25) {
        return this.db.select({
            id: caseNote.id,
            authorId: caseNote.authorId,
            authorTag: caseNote.authorTag,
            content: caseNote.content,
            createdAt: caseNote.createdAt,
        }).from(caseNote)
            .where(and(eq(caseNote.guildId, guildId), eq(caseNote.targetId, targetId)))
            .orderBy(desc(caseNote.createdAt)).limit(limit);
    }

    // ─── API BOUNDARY: General Guild Info ────────────────────

    async getGuildConfig(guildId) {
        return one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
    }

    async getGuildSettings(guildId) {
        return one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
    }

    // ─── API BOUNDARY: Panel System ──────────────────────────

    async getPanels(guildId) {
        return this.db.select().from(panel).where(eq(panel.guildId, guildId)).orderBy(asc(panel.panelType));
    }

    async getPanel(guildId, panelType) {
        return one(await this.db.select().from(panel)
            .where(and(eq(panel.guildId, guildId), eq(panel.panelType, panelType))).limit(1));
    }

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
