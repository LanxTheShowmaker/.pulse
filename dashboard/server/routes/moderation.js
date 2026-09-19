import { Router } from "express";
import { validateCaseNumber } from "../middleware/validate.js";

export function createModerationRouter(deps) {
    const { tickets, moderation } = deps;
    const router = Router();

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

    // :caseNumber is a case number: resolve the case first, then load
    // notes for the case's target (the only target-scoped notes query
    // the bot implements).
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
