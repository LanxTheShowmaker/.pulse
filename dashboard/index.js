import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServices } from "../core/services.js";
import { logger } from "../core/logger.js";
import crypto from "crypto";
import http from "http";

const expressApp = express();
expressApp.set("trust proxy", 1);
const prisma = new PrismaClient();

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

expressApp.use(helmet());
expressApp.use(express.json({ limit: "10kb" }));
expressApp.use(express.urlencoded({ extended: true, limit: "10kb" }));
expressApp.use(cookieParser());
expressApp.use(globalLimiter);

const prismaServices = createServices(prisma);
const { tickets, moderation, logging, settings } = prismaServices;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function createSession(userId, guildId) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.create({ data: { tokenHash, userId, guildId, expiresAt } });
    return { token, expiresAt };
}

async function validateSession(token) {
    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({ where: { tokenHash } });
    if (!session || Date.now() > session.expiresAt.getTime()) {
        if (session && Date.now() > session.expiresAt.getTime()) {
            await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        }
        return null;
    }
    return session;
}

async function deleteSessionByToken(token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
}

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || ("http://localhost:" + (process.env.DASHBOARD_PORT || 9875) + "/auth/discord/callback");

function discordOAuthURL(state) {
    const p = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: DISCORD_REDIRECT_URI, response_type: "code", scope: "identify guilds", state });
    return "https://discord.com/api/oauth2/authorize?" + p.toString();
}

function discordTokenExchange(code) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: DISCORD_REDIRECT_URI });
        const req = http.request("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("token parse")); } }); });
        req.on("error", reject);
        req.write(params.toString());
        req.end();
    });
}

function fetchDiscordUser(t) {
    return new Promise((r, j) => {
        const req = http.request("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + t } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { r(JSON.parse(d)); } catch (e) { j(new Error("user")); } }); });
        req.on("error", j); req.end();
    });
}

function fetchDiscordGuilds(t) {
    return new Promise((r, j) => {
        const req = http.request("https://discord.com/api/users/@me/guilds", { headers: { Authorization: "Bearer " + t } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { r(JSON.parse(d)); } catch (e) { j(new Error("guilds")); } }); });
        req.on("error", j); req.end();
    });
}

function isApiRoute(req) { return req.path.startsWith("/api/"); }

async function requireAuth(req, res, next) {
    const token = req.signedCookies?.session_token;
    if (!token) {
        if (isApiRoute(req)) return res.status(401).json({ error: "Authentication required." });
        return res.redirect("/auth/discord");
    }
    const session = await validateSession(token);
    if (!session) {
        res.clearCookie("session_token");
        if (isApiRoute(req)) return res.status(401).json({ error: "Session expired." });
        return res.redirect("/auth/discord");
    }
    req.session = session; req.userId = session.userId; req.guildId = session.guildId; next();
}

function requireGuildAuth(req, res, next) {
    const gid = req.params.guildId;
    if (!gid) { if (isApiRoute(req)) return res.status(400).json({ error: "Guild ID required." }); return res.status(400).send("Guild ID required."); }
    if (!req.guildId) { if (isApiRoute(req)) return res.status(403).json({ error: "No guild." }); return res.status(403).send("No guild."); }
    if (req.guildId !== gid) { if (isApiRoute(req)) return res.status(403).json({ error: "Access denied." }); return res.status(403).send("Access denied."); }
    next();
}

function errorHandler(err, req, res, next) {
    logger.error("error", err.message, err.stack);
    if (isApiRoute(req)) return res.status(500).json({ error: "Internal error." });
    res.status(500).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Error</title><style>body{font-family:system-ui;background:#0a0a0f;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.error{text-align:center}.error h1{font-size:3rem;color:#ff6b6b}.error p{color:#888}a{color:#90caf9}</style></head><body><div class="error"><h1>500</h1><p>Something went wrong.</p><a href="/dashboard">Back to Dashboard</a></div></body></html>`);
}

function getStyles() { return ":root{--bg:#0a0a0f;--surface:#1a1a2e;--surface-elevated:#16213e;--border:#2a2a4a;--text:#e0e0e0;--text-muted:#888;--accent:#90caf9;--success:#66bb6a;--error:#ff6b6b;--radius:8px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}.layout{display:flex;min-height:100vh}.sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);padding:1.5rem 0;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0}.sidebar-brand{padding:0 1.5rem 1.5rem;border-bottom:1px solid var(--border);margin-bottom:1rem}.sidebar-brand h1{font-size:1.25rem;color:var(--accent)}.sidebar nav{flex:1}.sidebar nav a{display:block;padding:0.6rem 1.5rem;color:var(--text-muted);text-decoration:none}.sidebar nav a:hover{color:var(--text);background:var(--surface-elevated)}.sidebar nav a.active{color:var(--accent);border-left:3px solid var(--accent)}.sidebar .user-area{padding:1rem 1.5rem;border-top:1px solid var(--border)}.sidebar .user-info{display:flex;align-items:center;gap:0.75rem;color:var(--text);font-size:0.875rem}.main{flex:1;margin-left:240px;padding:2rem}.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid var(--border)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem}.table-container{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}table{width:100%;border-collapse:collapse}th,td{padding:0.75rem 1rem;text-align:left;border-bottom:1px solid var(--border)}th{background:var(--surface-elevated);color:var(--text-muted);font-size:0.75rem;text-transform:uppercase}tr:hover{background:var(--surface-elevated)}.badge{display:inline-block;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600}.badge-open{background:rgba(102,187,106,0.2);color:var(--success)}.badge-closed{background:rgba(136,136,136,0.2);color:var(--text-muted)}.btn{padding:0.5rem 1rem;border-radius:var(--radius);border:none;cursor:pointer;font-size:0.875rem;font-weight:600;text-decoration:none}.btn-primary{background:var(--accent);color:var(--bg)}.btn-secondary{background:var(--surface-elevated);color:var(--text);border:1px solid var(--border)}@media(max-width:768px){.sidebar{width:60px}.main{margin-left:60px}}"; }

function sidebar(session, gid) { return `<div class="sidebar-brand"><h1>.pulse</h1><span>Control Panel</span></div><nav><a href="/dashboard" class="${!gid?'active':''}">Dashboard</a><a href="/dashboard/guild/${gid}/tickets" class="${gid?'active':''}">Tickets</a><a href="/dashboard/guild/${gid}/moderation/cases/recent" class="${gid?'active':''}">Moderation</a><a href="/dashboard/guild/${gid}/logs/mod" class="${gid?'active':''}">Mod Log</a><a href="/dashboard/guild/${gid}/config" class="${gid?'active':''}">Settings</a></nav><div class="user-area"><div class="user-info"><img src="${session.avatar}" style="width:32px;height:32px;border-radius:50%;" alt="${session.username}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"><span>${session.username}</span></div></div>`; }

function errorPage(msg) { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${getStyles()}</style></head><body><div class="layout"><main class="main"><div class="error-page"><h1 style="color:var(--error);">Error</h1><p>${msg}</p><a href="/dashboard" class="btn btn-primary">Back to Dashboard</a></div></main></div></body></html>`; }

expressApp.get("/", (req, res) => { res.redirect("/dashboard"); });

expressApp.get("/auth/discord", (req, res) => {
    const state = crypto.randomBytes(32).toString("hex");
    res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
    res.redirect(discordOAuthURL(state));
});

expressApp.get("/auth/discord/callback", async (req, res) => {
    try {
        const { code, state } = req.query;
        const oauthState = req.cookies?.oauth_state;
        if (!state || !oauthState || state !== oauthState) {
            return res.status(400).send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><main class="main"><div class="error-page"><h1>OAuth Failed</h1><p>Invalid state.</p><a href="/auth/discord" class="btn btn-primary">Try again</a></div></main></div></body></html>`);
        }
        if (!code) {
            return res.status(400).send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><main class="main"><div class="error-page"><h1>OAuth Failed</h1><p>Authorization denied.</p><a href="/auth/discord" class="btn btn-primary">Try again</a></div></main></div></body></html>`);
        }
        const tok = await discordTokenExchange(code);
        if (tok.error) {
            return res.status(400).send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><main class="main"><div class="error-page"><h1>OAuth Failed</h1><p>${tok.error_description||tok.error}</p><a href="/auth/discord" class="btn btn-primary">Try again</a></div></main></div></body></html>`);
        }
        const user = await fetchDiscordUser(tok.access_token);
        const guilds = await fetchDiscordGuilds(tok.access_token);
        const session = await createSession(user.id, guilds[0]?.id || null);
        res.cookie("session_token", session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_TTL_MS, signed: true, path: "/" });
        res.redirect("/dashboard");
    } catch (e) {
        logger.error("oauth", "callback", e);
        res.status(500).send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><main class="main"><div class="error-page"><h1>OAuth Failed</h1><p>Failed to complete authentication.</p><a href="/auth/discord" class="btn btn-primary">Try again</a></div></main></div></body></html>`);
    }
});

expressApp.post("/auth/logout", async (req, res) => {
    const t = req.signedCookies?.session_token;
    if (t) await deleteSessionByToken(t);
    res.clearCookie("session_token");
    res.clearCookie("oauth_state");
    res.redirect("/auth/discord");
});

expressApp.use(requireAuth);
expressApp.use("/api/guild/:guildId", requireGuildAuth);
expressApp.use("/dashboard/guild/:guildId", requireGuildAuth);

expressApp.get("/api/user", async (req, res) => { try { const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.status(401).json({ error: "Not authenticated." }); res.json({ id: s.userId, guildId: s.guildId }); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guilds", async (req, res) => { try { const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.status(403).json({ error: "No access." }); const guilds = await fetchDiscordGuilds(""); res.json(guilds); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.post("/api/guild/switch", async (req, res) => { try { const { guildId } = req.body; if (!guildId) return res.status(400).json({ error: "Guild ID required." }); const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.status(403).json({ error: "Not authenticated." }); if (s.guildId !== guildId) return res.status(403).json({ error: "Access denied." }); await prisma.session.update({ where: { id: s.id }, data: { guildId } }); res.json({ success: true, guildId }); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guild/:guildId/config", async (req, res) => { try { res.json(await settings.getGuildConfig(req.params.guildId)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.patch("/api/guild/:guildId/config", async (req, res) => { try { await settings.patch(req.params.guildId, req.body); res.json(await settings.getGuildConfig(req.params.guildId)); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guild/:guildId/tickets/open", async (req, res) => { try { res.json(await tickets.getOpenTicketsSummary(req.params.guildId, 50)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/tickets/recent", async (req, res) => { try { res.json(await tickets.getTicketHistorySummary(req.params.guildId, 50)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/tickets/:ticketId", async (req, res) => { try { res.json(await tickets.getTicketSummary(req.params.ticketId)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/tickets/type/:typeId", async (req, res) => { try { res.json(await prisma.ticketType.findUnique({ where: { id: req.params.typeId } })); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.post("/api/guild/:guildId/tickets/:ticketId/close", async (req, res) => { try { await tickets.close(req.params.ticketId, req.userId, req.body.closeReason); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.post("/api/guild/:guildId/tickets/:ticketId/reopen", async (req, res) => { try { await tickets.reopen(req.params.ticketId, req.userId); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.post("/api/guild/:guildId/tickets/:ticketId/rename", async (req, res) => { try { await tickets.rename(req.params.ticketId, req.body.newName, req.userId); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.post("/api/guild/:guildId/tickets/:ticketId/assign", async (req, res) => { try { await tickets.assign(req.params.ticketId, req.body.userId, req.userId); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.post("/api/guild/:guildId/tickets/:ticketId/priority", async (req, res) => { try { await tickets.setPriority(req.params.ticketId, req.body.newPriority, req.userId); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.post("/api/guild/:guildId/tickets/:ticketId/status", async (req, res) => { try { await tickets.setStatus(req.params.ticketId, req.body.newStatus, req.userId); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guild/:guildId/moderation/cases/recent", async (req, res) => { try { res.json(await moderation.getRecentCasesApi(req.params.guildId, 25)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/moderation/cases/:caseNumber", async (req, res) => { try { res.json(await moderation.getCaseApi(req.params.guildId, parseInt(req.params.caseNumber))); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/moderation/cases/target/:targetId", async (req, res) => { try { res.json(await moderation.getCasesByTargetApi(req.params.guildId, req.params.targetId, 25)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/moderation/cases/:caseId/notes", async (req, res) => { try { res.json(await moderation.getCaseNotesApi(req.params.guildId, req.params.caseId, 25)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/moderation/stats", async (req, res) => { try { res.json({ moderation: await moderation.getCaseStatsApi(req.params.guildId) }); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.get("/api/guild/:guildId/members/recent", async (req, res) => { try { const [t, c] = await Promise.all([tickets.getOpenTicketsSummary(req.params.guildId, 5), moderation.getRecentCasesApi(req.params.guildId, 5)]); res.json({ recentTickets: t, recentCases: c }); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guild/:guildId/logs/mod", async (req, res) => { try { res.json(await logging.getModLogHistory(req.params.guildId, 50)); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guild/:guildId/tickets", async (req, res) => { try { const [o, rt, tt, st] = await Promise.all([tickets.getOpenTicketsSummary(req.params.guildId, 50), tickets.getTicketHistorySummary(req.params.guildId, 20), prisma.ticketType.findMany({ where: { guildId: req.params.guildId } }), tickets.getStats(req.params.guildId)]); res.json({ openTickets: o, recentTickets: rt, ticketTypes: tt, stats: st }); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/api/guild/:guildId/activity/recent", async (req, res) => { try { const [t, c] = await Promise.all([tickets.getOpenTicketsSummary(req.params.guildId, 10), moderation.getRecentCasesApi(req.params.guildId, 10)]); res.json({ recentTickets: t, recentCases: c }); } catch (e) { res.status(500).json({ error: "Failed." }); } });

expressApp.get("/dashboard", async (req, res) => {
    try {
        const s = await prisma.session.findUnique({ where: { id: req.session?.id } });
        if (!s) return res.redirect("/auth/discord");
        const gid = req.guildId || s.guildId;
        const config = gid ? await settings.getGuildConfig(gid).catch(() => null) : null;
        const openTickets = gid ? await tickets.getOpenTicketsSummary(gid, 10).catch(() => []) : [];
        const recentCases = gid ? await moderation.getRecentCasesApi(gid, 5).catch(() => []) : [];
        const stats = gid ? await tickets.getStats(gid).catch(() => ({ open: 0, closed: 0, total: 0 })) : { open: 0, closed: 0, total: 0 };
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>.pulse Dashboard</title><style>${getStyles()}</style></head><body><div class="layout"><aside class="sidebar">${sidebar({ username: s.userId, avatar: "https://cdn.discordapp.com/embed/avatars/0.png" }, gid)}<main class="main"><div class="topbar"><h2>Dashboard</h2><form action="/auth/logout" method="POST" style="display:inline"><button type="submit" class="btn btn-secondary">Logout</button></form></div><div class="cards"><div class="card"><h3>Open Tickets</h3><div class="value">${stats.open||0}</div></div><div class="card"><h3>Closed</h3><div class="value">${stats.closed||0}</div></div><div class="card"><h3>Cases</h3><div class="value">${recentCases.length}</div></div></div><div class="table-container"><table><thead><tr><th>Ticket</th><th>Status</th><th>Priority</th></tr></thead><tbody>${openTickets.map(t => `<tr><td>#${t.id.slice(0,8)}</td><td><span class="badge badge-${t.status?.toLowerCase()||'open'}">${t.status||'OPEN'}</span></td><td>${t.priority||'NORMAL'}</td></tr>`).join('')}${openTickets.length===0?'<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:2rem;">No open tickets</td></tr>':''}</tbody></table></div></main></div></body></html>`);
    } catch (e) { res.status(500).send(errorPage("Failed to load dashboard.")); }
});

expressApp.get("/dashboard/guild/:guildId/tickets", async (req, res) => { try { const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.redirect("/auth/discord"); const gt = await tickets.getOpenTicketsSummary(req.params.guildId, 50); res.send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><aside class="sidebar">${sidebar({ username: s.userId }, req.params.guildId)}<main class="main"><div class="topbar"><h2>Tickets</h2></div><div class="table-container"><table><thead><tr><th>ID</th><th>Status</th><th>Priority</th></tr></thead><tbody>${gt.map(t => `<tr><td>#${t.id.slice(0,8)}</td><td><span class="badge badge-${t.status?.toLowerCase()||'open'}">${t.status||'OPEN'}</span></td><td>${t.priority||'NORMAL'}</td></tr>`).join('')}${gt.length===0?'<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:2rem;">No open tickets</td></tr>':''}</tbody></table></div></main></div></body></html>`); } catch (e) { res.status(500).send(errorPage("Failed to load tickets.")); } });

expressApp.get("/dashboard/guild/:guildId/moderation/cases/recent", async (req, res) => { try { const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.redirect("/auth/discord"); const c = await moderation.getRecentCasesApi(req.params.guildId, 25); res.send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><aside class="sidebar">${sidebar({ username: s.userId }, req.params.guildId)}<main class="main"><div class="topbar"><h2>Moderation Cases</h2></div><div class="table-container"><table><thead><tr><th>Case</th><th>Target</th><th>Action</th><th>Moderator</th></tr></thead><tbody>${c.map(x => `<tr><td>#${x.caseNumber}</td><td>${x.targetTag}</td><td>${x.action}</td><td>${x.moderatorTag}</td></tr>`).join('')}${c.length===0?'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem;">No cases found</td></tr>':''}</tbody></table></div></main></div></body></html>`); } catch (e) { res.status(500).send(errorPage("Failed to load cases.")); } });

expressApp.get("/dashboard/guild/:guildId/logs/mod", async (req, res) => { try { const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.redirect("/auth/discord"); const h = await logging.getModLogHistory(req.params.guildId, 50); res.send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><aside class="sidebar">${sidebar({ username: s.userId }, req.params.guildId)}<main class="main"><div class="topbar"><h2>Moderation Log</h2></div><div class="table-container"><table><thead><tr><th>Case</th><th>Action</th><th>Moderator</th><th>Date</th></tr></thead><tbody>${h.map(x => `<tr><td>#${x.caseNumber||'—'}</td><td>${x.action||x.event||'—'}</td><td>${x.moderatorTag||'—'}</td><td>${x.createdAt?new Date(x.createdAt).toLocaleDateString():'—'}</td></tr>`).join('')}${h.length===0?'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem;">No entries</td></tr>':''}</tbody></table></div></main></div></body></html>`); } catch (e) { res.status(500).send(errorPage("Failed to load mod log.")); } });

expressApp.get("/dashboard/guild/:guildId/config", async (req, res) => { try { const s = await prisma.session.findUnique({ where: { id: req.session?.id } }); if (!s) return res.redirect("/auth/discord"); const c = await settings.getGuildConfig(req.params.guildId).catch(() => null); res.send(`<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body><div class="layout"><aside class="sidebar">${sidebar({ username: s.userId }, req.params.guildId)}<main class="main"><div class="topbar"><h2>Server Settings</h2></div><div class="card"><h3>Guild Configuration</h3>${c?`<p style="color:var(--text-muted)">Prefix: <strong>${c.prefix||'!'}</strong></p>`:'<p style="color:var(--text-muted)">No config found.</p>'}</div></main></div></body></html>`); } catch (e) { res.status(500).send(errorPage("Failed to load settings.")); } });

expressApp.use((req, res) => { if (isApiRoute(req)) return res.status(404).json({ error: "Not found." }); res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>404</title><style>${getStyles()}</style></head><body><div class="layout"><main class="main"><div class="error-page"><h1>404</h1><p>Page not found.</p><a href="/dashboard" class="btn btn-primary">Back to Dashboard</a></div></main></div></body></html>`); });

expressApp.use(errorHandler);

export default expressApp;

export async function startServer() {
    try { await prisma.$connect(); logger.info("db", "Dashboard Prisma connected."); } catch (e) { logger.error("db", "Dashboard Prisma connection failed", e); throw e; }
    return new Promise((resolve, reject) => {
        const server = expressApp.listen(process.env.DASHBOARD_PORT || 9875, "0.0.0.0", () => { logger.info("dashboard", ".pulse dashboard listening on 0.0.0.0:" + (process.env.DASHBOARD_PORT || 9875)); resolve(); });
        server.on("error", reject);
    });
}
