import { Router } from "express";
import { logger } from "../../../core/logger.js";
import { getSessionPrisma } from "../services/session.js";
import { getGuildInfo } from "../services/guild.js";
import { getOverview } from "../services/overview.js";
import { serviceError, validateTicketId, validateCaseNumber, validateSettingsBody } from "../middleware/validate.js";

const prisma = getSessionPrisma();

// Load a ticket and enforce session-guild ownership. Returns { ticket }
// or sends 404/403 and returns null.
async function ownedTicket(req, res, ticketId) {
    const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!t) { res.status(404).json({ error: "Ticket not found." }); return null; }
    if (t.guildId !== req.guildId) {
        logger.info("auth", `ticket access denied: user ${req.userId} guild ${req.guildId} != ticket ${ticketId} guild ${t.guildId}`);
        res.status(403).json({ error: "Access denied to this ticket." });
        return null;
    }
    return t;
}

export function createApiRouter(deps) {
    const { tickets, moderation, logging, settings } = deps;
    const router = Router();

    // ── Session / guilds ────────────────────────────────
    router.get("/api/user", async (req, res) => {
        try {
            const s = await prisma.session.findUnique({ where: { id: req.session?.id } });
            if (!s) return res.status(401).json({ error: "Not authenticated." });
            res.json({ id: s.userId, guildId: s.guildId, expiresAt: s.expiresAt });
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // Guilds the session may manage: derived from the verified session
    // guild + live bot cache. Never invents access.
    router.get("/api/guilds", async (req, res) => {
        try {
            if (!req.guildId) return res.json([]);
            const info = getGuildInfo(req.guildId);
            res.json([{ id: req.guildId, name: info?.name || null, icon: info?.icon || null, memberCount: info?.memberCount ?? null, current: true }]);
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.post("/api/guild/switch", async (req, res) => {
        try {
            const { guildId } = req.body;
            if (!guildId) return res.status(400).json({ error: "Guild ID required." });
            const s = await prisma.session.findUnique({ where: { id: req.session?.id } });
            if (!s) return res.status(403).json({ error: "Not authenticated." });
            if (s.guildId !== guildId) return res.status(403).json({ error: "Access denied." });
            await prisma.session.update({ where: { id: s.id }, data: { guildId } });
            res.json({ success: true, guildId });
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // ── Overview ────────────────────────────────────────
    router.get("/api/guild/:guildId/overview", async (req, res) => {
        try {
            res.json(await getOverview(deps, req.params.guildId));
        } catch (e) {
            logger.error("api", `overview failed for ${req.params.guildId}`, e?.message);
            res.status(500).json({ error: "Failed to load overview." });
        }
    });

    // ── Guild configuration ─────────────────────────────
    router.get("/api/guild/:guildId/config", async (req, res) => {
        try { res.json(await settings.get(req.params.guildId)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.patch("/api/guild/:guildId/config", validateSettingsBody, async (req, res) => {
        try {
            await settings.patch(req.params.guildId, req.cleanSettings);
            res.json(await settings.get(req.params.guildId));
        } catch (e) {
            logger.error("api", `patch config failed for ${req.params.guildId}`, e?.message);
            res.status(500).json({ error: "Failed." });
        }
    });

    // ── Tickets ─────────────────────────────────────────
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
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            res.json(await tickets.getTicketSummary(t.id));
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // Full detail view: summary + type (via actual typeId FK lookup,
    // no invented relation) + history + notes.
    router.get("/api/guild/:guildId/tickets/:ticketId/detail", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            const [summary, history, notes] = await Promise.all([
                tickets.getTicketSummary(t.id),
                tickets.getHistory(t.id).catch(() => []),
                tickets.getNotes(t.id).catch(() => []),
            ]);
            let type = null;
            if (t.typeId) {
                type = await prisma.ticketType.findUnique({ where: { id: t.typeId } }).catch(() => null);
                if (type && type.guildId !== req.guildId) type = null;
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
            const type = await prisma.ticketType.findUnique({ where: { id: req.params.typeId } });
            if (!type) return res.status(404).json({ error: "Ticket type not found." });
            if (type.guildId !== req.guildId) return res.status(403).json({ error: "Access denied." });
            res.json(type);
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // Mutations resolve ticketId -> channelId first: the ticket service
    // close/reopen operate on channelId (bot passes channel.id), while
    // rename/assign/priority/status operate on the ticket id.
    router.post("/api/guild/:guildId/tickets/:ticketId/close", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            const result = await tickets.close(t.channelId, req.userId, req.body.closeReason);
            res.json({ success: true, ticketId: t.id, status: result?.status || "CLOSED" });
        } catch (e) { serviceError(res, e, "Close ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/reopen", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            await tickets.reopen(t.channelId, req.userId);
            res.json({ success: true, ticketId: t.id });
        } catch (e) { serviceError(res, e, "Reopen ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/rename", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            await tickets.rename(t.id, req.body.newName, req.userId);
            res.json({ success: true, ticketId: t.id, newName: req.body.newName });
        } catch (e) { serviceError(res, e, "Rename ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/assign", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            await tickets.assign(t.id, req.body.userId, req.userId);
            res.json({ success: true, ticketId: t.id });
        } catch (e) { serviceError(res, e, "Assign ticket"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/priority", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            await tickets.setPriority(t.id, req.body.newPriority, req.userId);
            res.json({ success: true, ticketId: t.id, newPriority: req.body.newPriority });
        } catch (e) { serviceError(res, e, "Set priority"); }
    });

    router.post("/api/guild/:guildId/tickets/:ticketId/status", validateTicketId, async (req, res) => {
        try {
            const t = await ownedTicket(req, res, req.params.ticketId);
            if (!t) return;
            await tickets.setStatus(t.id, req.body.newStatus, req.userId);
            res.json({ success: true, ticketId: t.id, newStatus: req.body.newStatus });
        } catch (e) { serviceError(res, e, "Set status"); }
    });

    // ── Moderation ──────────────────────────────────────
    router.get("/api/guild/:guildId/moderation/cases/recent", async (req, res) => {
        try { res.json(await moderation.getRecentCasesApi(req.params.guildId, 25)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/moderation/cases/:caseNumber", validateCaseNumber, async (req, res) => {
        try {
            const c = await moderation.getCaseApi(req.params.guildId, req.caseNumber);
            if (!c) return res.status(404).json({ error: "Case not found." });
            res.json(c);
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/moderation/cases/target/:targetId", async (req, res) => {
        try { res.json(await moderation.getCasesByTargetApi(req.params.guildId, req.params.targetId, 25)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // :caseNumber is a case number: resolve the case, then load notes for
    // the case's target (the only target-scoped notes query that exists).
    router.get("/api/guild/:guildId/moderation/cases/:caseNumber/notes", validateCaseNumber, async (req, res) => {
        try {
            const c = await moderation.getCaseApi(req.params.guildId, req.caseNumber);
            if (!c) return res.status(404).json({ error: "Case not found." });
            res.json(await moderation.getCaseNotesApi(req.params.guildId, c.targetId, 25));
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/moderation/stats", async (req, res) => {
        try { res.json({ moderation: await moderation.getCaseStatsApi(req.params.guildId) }); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/members/recent", async (req, res) => {
        try {
            const [recentTickets, recentCases] = await Promise.all([
                tickets.getOpenTicketsSummary(req.params.guildId, 5),
                moderation.getRecentCasesApi(req.params.guildId, 5),
            ]);
            res.json({ recentTickets, recentCases });
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/logs/mod", async (req, res) => {
        try { res.json(await logging.getModLogHistory(req.params.guildId, 50)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.get("/api/guild/:guildId/activity/recent", async (req, res) => {
        try {
            const [recentTickets, recentCases] = await Promise.all([
                tickets.getOpenTicketsSummary(req.params.guildId, 10),
                moderation.getRecentCasesApi(req.params.guildId, 10),
            ]);
            res.json({ recentTickets, recentCases });
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    return router;
}
