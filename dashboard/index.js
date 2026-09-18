import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServices } from "../core/services.js";
import { logger } from "../core/logger.js";

const app = express();
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
app.use(helmet());

// ── Body parsing ────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

app.use(globalLimiter);

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
app.get("/api/guild/:guildId/config", authenticateDiscord, async (req, res) => {
    try {
        const config = await settings.getGuildConfig(req.params.guildId);
        res.json(config);
    } catch (e) {
        logger.error("api", `get config error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch guild config." });
    }
});

app.patch("/api/guild/:guildId/config", authenticateDiscord, async (req, res) => {
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
app.get("/api/guild/:guildId/tickets/open", authenticateDiscord, async (req, res) => {
    try {
        const summaries = await tickets.getOpenTicketsSummary(req.params.guildId, 50);
        res.json(summaries);
    } catch (e) {
        logger.error("api", `get open tickets error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch open tickets." });
    }
});

app.get("/api/guild/:guildId/tickets/recent", authenticateDiscord, async (req, res) => {
    try {
        const summaries = await tickets.getTicketHistorySummary(req.params.guildId, 50);
        res.json(summaries);
    } catch (e) {
        logger.error("api", `get recent tickets error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch recent tickets." });
    }
});

// ── API: Moderation cases ───────────────────────────────
app.get("/api/guild/:guildId/moderation/cases/recent", authenticateDiscord, async (req, res) => {
    try {
        const casesList = await moderation.getRecentCasesApi(req.params.guildId, 25);
        res.json(casesList);
    } catch (e) {
        logger.error("api", `get recent cases error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch moderation cases." });
    }
});

app.get("/api/guild/:guildId/moderation/cases/:caseNumber", authenticateDiscord, async (req, res) => {
    try {
        const caseData = await moderation.getCaseApi(req.params.guildId, parseInt(req.params.caseNumber));
        res.json(caseData);
    } catch (e) {
        logger.error("api", `get case error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch case." });
    }
});

// ── API: Mod log history ────────────────────────────────
app.get("/api/guild/:guildId/logs/mod", authenticateDiscord, async (req, res) => {
    try {
        const history = await logging.getModLogHistory(req.params.guildId, 50);
        res.json(history);
    } catch (e) {
        logger.error("api", `get mod log error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch mod log history." });
    }
});

// ── API: Stats ──────────────────────────────────────────
app.get("/api/guild/:guildId/statistics", authenticateDiscord, async (req, res) => {
    try {
        const [ticketStats, modStats, recentTickets, recentCases, modLog] = await Promise.all([
            tickets.getStats(req.params.guildId),
            moderation.getCaseStatsApi(req.params.guildId),
            tickets.getOpenTicketsSummary(req.params.guildId, 5),
            moderation.getRecentCasesApi(req.params.guildId, 5),
            logging.getModLogHistory(req.params.guildId, 5),
        ]);
        res.json({
            tickets: ticketStats,
            moderation: modStats,
            recentTickets,
            recentCases,
            modLog,
        });
    } catch (e) {
        logger.error("api", `get statistics error for ${req.params.guildId}`, e);
        res.status(500).json({ error: "Failed to fetch statistics." });
    }
});

// ── API: Recent activity ────────────────────────────────
app.get("/api/guild/:guildId/activity/recent", authenticateDiscord, async (req, res) => {
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
app.get("/dashboard", authenticateDiscord, (req, res) => {
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

// ── Start server ────────────────────────────────────────
const PORT = process.env.DASHBOARD_PORT || 3000;

app.listen(PORT, async () => {
    logger.info("dashboard", `.pulse dashboard listening on port ${PORT}`);

    // Initialize Prisma connection
    try {
        await prisma.$connect();
        logger.info("db", "Dashboard Prisma connected.");
    } catch (e) {
        logger.error("db", "Dashboard Prisma connection failed", e);
        process.exit(1);
    }
});