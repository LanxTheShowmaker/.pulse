import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServices } from "../core/services.js";
import { logger } from "../core/logger.js";

const expressApp = express();
const prisma = new PrismaClient();

// ── Rate limiting ───────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

// ── Helmet security headers ─────────────────────────────
expressApp.use(helmet());

// ── Body parsing ────────────────────────────────────────
expressApp.use(express.json({ limit: "10kb" }));
expressApp.use(express.urlencoded({ extended: true, limit: "10kb" }));
expressApp.use(cookieParser());

expressApp.use(globalLimiter);

// ── Prisma services ─────────────────────────────────────
const prismaServices = createServices(prisma);
const { tickets, moderation, logging, settings, cases } = prismaServices;

// ── Authentication middleware (simple token-based for dashboard) ────────────────
function authenticateDiscord(req, res, next) {
    // In production, validate session/JWT token here
    // For now, allow all requests to the dashboard API
    next();
}

// ── API: Guild configuration ────────────────────────────
expressApp.get("/api/guild/:guildId/config", authenticateDiscord, async (req, res) => {
    try {
        const config = await settings.getGuildConfig(req.params.guildId);
        res.json(config);
    } catch (e) {
        logger.error("api", `get config error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch guild config." });
    }
});

expressApp.patch("/api/guild/:guildId/config", authenticateDiscord, async (req, res) => {
    try {
        const data = req.body;
        await settings.patch(req.params.guildId, data);
        const config = await settings.getGuildConfig(req.params.guildId);
        res.json(config);
    } catch (e) {
        logger.error("api", `patch config error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to update guild config." });
    }
});

// ── API: Ticket summaries ───────────────────────────────
expressApp.get("/api/guild/:guildId/tickets/open", authenticateDiscord, async (req, res) => {
    try {
        const summaries = await tickets.getOpenTicketsSummary(req.params.guildId, 50);
        res.json(summaries);
    } catch (e) {
        logger.error("api", `get open tickets error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch open tickets." });
    }
});

expressApp.get("/api/guild/:guildId/tickets/recent", authenticateDiscord, async (req, res) => {
    try {
        const summaries = await tickets.getTicketHistorySummary(req.params.guildId, 50);
        res.json(summaries);
    } catch (e) {
        logger.error("api", `get recent tickets error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch recent tickets." });
    }
});

// ── API: Moderation cases ───────────────────────────────
expressApp.get("/api/guild/:guildId/moderation/cases/recent", authenticateDiscord, async (req, res) => {
    try {
        const casesList = await moderation.getRecentCasesApi(req.params.guildId, 25);
        res.json(casesList);
    } catch (e) {
        logger.error("api", `get recent cases error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch moderation cases." });
    }
});

expressApp.get("/api/guild/:guildId/moderation/cases/:caseNumber", authenticateDiscord, async (req, res) => {
    try {
        const caseData = await moderation.getCaseApi(req.params.guildId, parseInt(req.params.caseNumber));
        res.json(caseData);
    } catch (e) {
        logger.error("api", `get case error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch case." });
    }
});

expressApp.get("/api/guild/:guildId/moderation/cases/target/:targetId", authenticateDiscord, async (req, res) => {
    try {
        const casesList = await moderation.getCasesByTargetApi(req.params.guildId, req.params.targetId, 25);
        res.json(casesList);
    } catch (e) {
        logger.error("api", `get cases by target error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch cases by target." });
    }
});

expressApp.get("/api/guild/:guildId/moderation/cases/:caseId/notes", authenticateDiscord, async (req, res) => {
    try {
        const notesList = await moderation.getCaseNotesApi(req.params.guildId, req.params.caseId, 25);
        res.json(notesList);
    } catch (e) {
        logger.error("api", `get case notes error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch case notes." });
    }
});

expressApp.get("/api/guild/:guildId/moderation/stats", authenticateDiscord, async (req, res) => {
    try {
        const modStats = await moderation.getCaseStatsApi(req.params.guildId);
        res.json({ moderation: modStats });
    } catch (e) {
        logger.error("api", `get moderation stats error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch moderation stats." });
    }
});

expressApp.get("/api/guild/:guildId/members/recent", authenticateDiscord, async (req, res) => {
    try {
        // Get recent activity from tickets and mod cases
        const [recentTickets, recentCases] = await Promise.all([
            tickets.getOpenTicketsSummary(req.params.guildId, 5),
            moderation.getRecentCasesApi(req.params.guildId, 5),
        ]);
        res.json({
            recentTickets,
            recentCases,
        });
    } catch (e) {
        logger.error("api", `get activity error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch recent activity." });
    }
});

// ── API: Mod log history ────────────────────────────────
expressApp.get("/api/guild/:guildId/logs/mod", authenticateDiscord, async (req, res) => {
    try {
        const history = await logging.getModLogHistory(req.params.guildId, 50);
        res.json(history);
    } catch (e) {
        logger.error("api", `get mod log error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch mod log history." });
    }
});

// ── API: Stats ──────────────────────────────────────────
expressApp.get("/api/guild/:guildId/tickets", authenticateDiscord, async (req, res) => {
    try {
        const [openTickets, recentTickets, ticketTypes, stats] = await Promise.all([
            tickets.getOpenTicketsSummary(req.params.guildId, 50),
            tickets.getTicketHistorySummary(req.params.guildId, 20),
            prisma.ticketType.findMany({ where: { guildId: req.params.guildId } }),
            tickets.getStats(req.params.guildId),
        ]);
        res.json({
            openTickets,
            recentTickets,
            ticketTypes,
            stats,
        });
    } catch (e) {
        logger.error("api", `get tickets error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch tickets." });
    }
});

expressApp.get("/api/guild/:guildId/tickets/:ticketId", authenticateDiscord, async (req, res) => {
    try {
        const summary = await tickets.getTicketSummary(req.params.ticketId);
        res.json(summary);
    } catch (e) {
        logger.error("api", `get ticket error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to fetch ticket." });
    }
});

expressApp.get("/api/guild/:guildId/tickets/type/:typeId", authenticateDiscord, async (req, res) => {
    try {
        const type = await prisma.ticketType.findUnique({ where: { id: req.params.typeId } });
        res.json(type);
    } catch (e) {
        logger.error("api", `get type error for ${req.params.typeId}`, e);
        res.status(500).json({ error: "Failed to fetch ticket type." });
    }
});

// ── API: Ticket actions ─────────────────────────────────

expressApp.post("/api/guild/:guildId/tickets/:ticketId/close", authenticateDiscord, async (req, res) => {
    try {
        const result = await tickets.close(req.params.ticketId, req.user.id, req.body.closeReason);
        res.json({ success: true, ticketId: req.params.ticketId });
    } catch (e) {
        logger.error("api", `close ticket error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to close ticket." });
    }
});

expressApp.post("/api/guild/:guildId/tickets/:ticketId/reopen", authenticateDiscord, async (req, res) => {
    try {
        const result = await tickets.reopen(req.params.ticketId, req.user.id);
        res.json({ success: true, ticketId: req.params.ticketId });
    } catch (e) {
        logger.error("api", `reopen ticket error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to reopen ticket." });
    }
});

expressApp.post("/api/guild/:guildId/tickets/:ticketId/rename", authenticateDiscord, async (req, res) => {
    try {
        const result = await tickets.rename(req.params.ticketId, req.body.newName, req.user.id);
        res.json({ success: true, ticketId: req.params.ticketId, newName: req.body.newName });
    } catch (e) {
        logger.error("api", `rename ticket error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to rename ticket." });
    }
});

expressApp.post("/api/guild/:guildId/tickets/:ticketId/assign", authenticateDiscord, async (req, res) => {
    try {
        const result = await tickets.assign(req.params.ticketId, req.body.userId, req.user.id);
        res.json({ success: true, ticketId: req.params.ticketId });
    } catch (e) {
        logger.error("api", `assign ticket error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to assign ticket." });
    }
});

expressApp.post("/api/guild/:guildId/tickets/:ticketId/priority", authenticateDiscord, async (req, res) => {
    try {
        const result = await tickets.setPriority(req.params.ticketId, req.body.newPriority, req.user.id);
        res.json({ success: true, ticketId: req.params.ticketId, newPriority: req.body.newPriority });
    } catch (e) {
        logger.error("api", `set priority error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to set priority." });
    }
});

expressApp.post("/api/guild/:guildId/tickets/:ticketId/status", authenticateDiscord, async (req, res) => {
    try {
        const result = await tickets.setStatus(req.params.ticketId, req.body.newStatus, req.user.id);
        res.json({ success: true, ticketId: req.params.ticketId, newStatus: req.body.newStatus });
    } catch (e) {
        logger.error("api", `set status error for ${req.params.ticketId}`, e);
        res.status(500).json({ error: "Failed to set status." });
    }
});

// ── API: Recent activity ────────────────────────────────
expressApp.get("/api/guild/:guildId/activity/recent", authenticateDiscord, async (req, res) => {
    try {
        // Get recent ticket opens and mod cases
        const [recentTickets, recentCases] = await Promise.all([
            tickets.getOpenTicketsSummary(req.params.guildId, 10),
            moderation.getRecentCasesApi(req.params.guildId, 10),
        ]);
        res.json({
            recentTickets,
            recentCases,
        });
    } catch (e) {
        logger.error("api", `get activity error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch recent activity." });
    }
});

// ── Dashboard HTML page ─────────────────────────────────
expressApp.get("/dashboard", authenticateDiscord, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>.pulse — Dashboard</title>
            <style>
                body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #0a0a0f; color: #e0e0e0; }
                .dashboard { max-width: 800px; margin: 0 auto; }
                header { border-bottom: 1px solid #333; padding-bottom: 1rem; margin-bottom: 1rem; }
                nav { display: flex; gap: 1rem; margin: 1rem 0; }
                nav a { color: #90caf9; text-decoration: none; background: #1a2332; padding: 0.5rem 1rem; border-radius: 4px; }
                nav a:hover { background: #283747; }
                main { line-height: 1.6; }
                .card { background: #1a2332; padding: 1.5rem; border-radius: 8; margin: 1rem 0; }
                .stat-row { display: flex; justify-content: space-between; margin: 0.5rem 0; }
                .stat-label { color: #888; }
                .stat-value { color: #e0e0e0; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <header>
                    <h1>.pulse Dashboard</h1>
                </header>
                <nav>
                    <a href="/api/guild/statistics">Statistics</a>
                    <a href="/api/guild/:guildId/tickets/open">Open Tickets</a>
                    <a href="/api/guild/:guildId/moderation/cases/recent">Moderation Cases</a>
                    <a href="/api/guild/:guildId/logs/mod">Mod Log</a>
                </nav>
                <main>
                    <div class="card" id="stats-card">
                        <h2>Statistics</h2>
                        <div class="stat-row">
                            <span class="stat-label">Open Tickets</span>
                            <span class="stat-value" id="open-tickets">Loading...</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Closed Tickets</span>
                            <span class="stat-value" id="closed-tickets">Loading...</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Moderation Cases</span>
                            <span class="stat-value" id="mod-cases">Loading...</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Recent Mod Actions</span>
                            <span class="stat-value" id="mod-actions">Loading...</span>
                        </div>
                    </div>
                </main>
            </div>
        </body>
        </html>
    `);
});

// ── Start server (separate entry point) ───────────────
export default expressApp;

export async function startServer() {
    try {
        await prisma.$connect();
        logger.info("db", "Dashboard Prisma connected.");
    } catch (e) {
        logger.error("db", "Dashboard Prisma connection failed", e);
        throw e;
    }

    return new Promise((resolve, reject) => {
        const server = expressApp.listen(process.env.DASHBOARD_PORT || 9875, "0.0.0.0", () => {
            logger.info("dashboard", `.pulse dashboard listening on 0.0.0.0:${process.env.DASHBOARD_PORT || 9875}`);
            resolve();
        });

        server.on("error", reject);
    });
}
