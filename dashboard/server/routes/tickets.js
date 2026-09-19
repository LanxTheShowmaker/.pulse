import { Router } from "express";
import { logger } from "../../../core/logger.js";
import { getSessionPrisma } from "../services/session.js";
import { ownedTicket, ownedType } from "../services/access.js";
import { serviceError, validateTicketId } from "../middleware/validate.js";

const prisma = getSessionPrisma();

export function createTicketsRouter(deps) {
    const { tickets } = deps;
    const router = Router();

    router.get("/api/guild/:guildId/tickets/open", async (req, res) => {
        try { res.json(await tickets.getOpenTicketsSummary(req.params.guildId, 50)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/tickets/recent", async (req, res) => {
        try { res.json(await tickets.getTicketHistorySummary(req.params.guildId, 50)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/tickets", async (req, res) => {
        try {
            const [openTickets, recentTickets, ticketTypes, stats] = await Promise.all([
                tickets.getOpenTicketsSummary(req.params.guildId, 50),
                tickets.getTicketHistorySummary(req.params.guildId, 20),
                prisma.ticketType.findMany({ where: { guildId: req.params.guildId } }),
                tickets.getStats(req.params.guildId),
            ]);
            res.json({ openTickets, recentTickets, ticketTypes, stats });
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/tickets/:ticketId", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            res.json(await tickets.getTicketSummary(t.id));
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // Full detail view: summary + type (explicit typeId FK lookup, no
    // invented relation) + history + notes + form response.
    router.get("/api/guild/:guildId/tickets/:ticketId/detail", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            const [summary, history, notes] = await Promise.all([
                tickets.getTicketSummary(t.id),
                tickets.getHistory(t.id).catch(() => []),
                tickets.getNotes(t.id).catch(() => []),
            ]);
            let type = null;
            if (t.typeId) {
                type = await ownedType(prisma, req, res, t.typeId);
                if (type === null && res.headersSent) return;
            }
            let formResponse = null;
            try {
                formResponse = await prisma.ticketFormResponse.findUnique({
                    where: { guildId_ticketId: { guildId: t.guildId, ticketId: t.id } },
                });
            } catch { formResponse = null; }
            res.json({ summary, type, history, notes, formResponse });
        } catch (e) {
            logger.error("api", `ticket detail failed for ${req.params.ticketId}`, e?.message);
            res.status(500).json({ error: "Failed." });
        }
    });

    router.get("/api/guild/:guildId/tickets/type/:typeId", async (req, res) => {
        try {
            const type = await ownedType(prisma, req, res, req.params.typeId);
            if (!type) return;
            res.json(type);
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // Mutations: resolve ticketId -> channelId first, because the ticket
    // service close/reopen operate on channelId (the bot passes
    // channel.id). rename/assign/priority/status take the ticket id.
    router.post("/api/guild/:guildId/tickets/:ticketId/close", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            const result = await tickets.close(t.channelId, req.userId, req.body.closeReason);
            res.json({ success: true, ticketId: t.id, status: result?.status || "CLOSED" });
        } catch (e) { serviceError(res, e, "Close ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/reopen", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            await tickets.reopen(t.channelId, req.userId);
            res.json({ success: true, ticketId: t.id });
        } catch (e) { serviceError(res, e, "Reopen ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/rename", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            await tickets.rename(t.id, req.body.newName, req.userId);
            res.json({ success: true, ticketId: t.id, newName: req.body.newName });
        } catch (e) { serviceError(res, e, "Rename ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/assign", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            await tickets.assign(t.id, req.body.userId, req.userId);
            res.json({ success: true, ticketId: t.id });
        } catch (e) { serviceError(res, e, "Assign ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/priority", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            await tickets.setPriority(t.id, req.body.newPriority, req.userId);
            res.json({ success: true, ticketId: t.id, newPriority: req.body.newPriority });
        } catch (e) { serviceError(res, e, "Set priority"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/status", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(prisma, req, res, req.params.ticketId);
            if (!t) return;
            await tickets.setStatus(t.id, req.body.newStatus, req.userId);
            res.json({ success: true, ticketId: t.id, newStatus: req.body.newStatus });
        } catch (e) { serviceError(res, e, "Set status"); }
    });

    return router;
}
