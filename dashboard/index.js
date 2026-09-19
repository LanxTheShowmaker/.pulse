import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createServices } from "../core/services.js";
import { logger } from "../core/logger.js";
import crypto from "crypto";
import https from "https";

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
expressApp.use(cookieParser(process.env.SESSION_SECRET));
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
        const req = https.request("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("token parse")); } }); });
        req.on("error", reject);
        req.write(params.toString());
        req.end();
    });
}

function fetchDiscordUser(t) {
    return new Promise((r, j) => {
        const req = https.request("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + t } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { r(JSON.parse(d)); } catch (e) { j(new Error("user")); } }); });
        req.on("error", j); req.end();
    });
}

function fetchDiscordGuilds(t) {
    return new Promise((r, j) => {
        const req = https.request("https://discord.com/api/users/@me/guilds", { headers: { Authorization: "Bearer " + t } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { r(JSON.parse(d)); } catch (e) { j(new Error("guilds")); } }); });
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

// ── Read-only live data helpers (no contract changes) ───
// Guild display info + bot status come straight from the running
// Discord client cache. Anything unknown is reported as unknown —
// never fabricated.

function getGuildInfo(gid) {
    try {
        const client = globalThis._client;
        const g = client?.guilds?.cache?.get(gid);
        if (!g) return null;
        return {
            id: g.id,
            name: g.name || null,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            memberCount: typeof g.memberCount === "number" ? g.memberCount : null,
        };
    } catch { return null; }
}

async function getBotStatus() {
    let dbOk = false;
    try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch { dbOk = false; }
    try {
        const client = globalThis._client;
        if (!client || !client.user) return { online: false, dbOk };
        const ping = client.ws?.ping;
        return {
            online: true,
            tag: client.user.tag || null,
            ping: typeof ping === "number" && ping >= 0 ? ping : null,
            uptimeMs: typeof client.uptime === "number" ? client.uptime : null,
            guilds: typeof client.guilds?.cache?.size === "number" ? client.guilds.cache.size : null,
            dbOk,
        };
    } catch { return { online: false, dbOk }; }
}

function fmtUptime(ms) {
    if (ms == null || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}

// ── Presentation helpers ────────────────────────────────
// HTML-escape anything interpolated into pages (tags, reasons, ids).

function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortId(id) {
    const s = String(id ?? "");
    return s.length > 12 ? s.slice(0, 6) + "…" + s.slice(-4) : s;
}

function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return `<time datetime="${esc(d.toISOString())}" data-rel title="${esc(fmtDate(d))}">${esc(fmtDate(d))}</time>`;
}

const ICONS = {
    dashboard: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.2"/></svg>',
    ticket: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h9A1.5 1.5 0 0 1 14 5.5v1.7a1.8 1.8 0 0 0 0 3.6v1.7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-7Z"/><path d="M10 4v10" stroke-dasharray="1.5 1.5"/></svg>',
    shield: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.3-5 6.5-2.9-1.2-5-3.3-5-6.5v-4L8 1.5Z"/><path d="m5.8 7.8 1.6 1.6 2.8-3"/></svg>',
    log: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 2.5h10v11H3z"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/></svg>',
    settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12"/></svg>',
    collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
    logout: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 2.5H3.5v11H6M10.5 5 13 8l-2.5 3M13 8H6.5"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5"/></svg>',
    alert: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.2M8 11h.01"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.2"/><path d="m10.3 10.3 3.2 3.2"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
    server: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2.5" width="12" height="4.5" rx="1"/><rect x="2" y="9" width="12" height="4.5" rx="1"/><path d="M4.5 4.7h.01M4.5 11.2h.01"/></svg>',
    user: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="5.2" r="2.7"/><path d="M2.5 13.5c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4"/></svg>',
    pulse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1.5 8h3l1.5-3.5 2.5 7L10.5 8h4"/></svg>',
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
};

function getStyles() {
    return [
        ":root{",
        "--bg:#0b0d12;--surface:#11141b;--surface-2:#171b23;--surface-3:#1e2330;",
        "--border:rgba(255,255,255,.07);--border-strong:rgba(255,255,255,.12);",
        "--text:#f1f3f5;--text-2:#9aa1ad;--text-3:#6f7785;",
        "--accent:#5865f2;--accent-hover:#4752c4;--accent-soft:rgba(88,101,242,.14);",
        "--success:#3ba55d;--success-soft:rgba(59,165,93,.14);",
        "--warning:#faa81a;--warning-soft:rgba(250,168,26,.13);",
        "--danger:#ed4245;--danger-soft:rgba(237,66,69,.13);",
        "--info:#5b8cff;--info-soft:rgba(91,140,255,.13);",
        "--radius-sm:7px;--radius-md:10px;--radius-lg:14px;",
        "--shadow-sm:0 1px 2px rgba(0,0,0,.35);--shadow-md:0 8px 24px rgba(0,0,0,.45);",
        "--font:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif;",
        "--mono:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;",
        "}",
        "*,*::before,*::after{box-sizing:border-box}",
        "*{margin:0;padding:0}",
        "html{-webkit-text-size-adjust:100%}",
        "body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.55;font-size:15px;min-height:100vh;-webkit-font-smoothing:antialiased}",
        "a{color:var(--accent);text-decoration:none}",
        "a:hover{text-decoration:underline}",
        ":focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}",
        ".skip-link{position:absolute;left:-9999px;top:0;background:var(--accent);color:#fff;padding:.6rem 1rem;border-radius:0 0 8px 0;z-index:100}",
        ".skip-link:focus{left:0}",
        /* ── app shell ── */
        ".app-shell{display:flex;min-height:100vh}",
        ".sidebar{width:248px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;z-index:40;display:flex;flex-direction:column;transition:transform .18s ease,width .18s ease}",
        ".brand{display:flex;align-items:center;gap:.65rem;padding:1.05rem 1.1rem;border-bottom:1px solid var(--border)}",
        ".brand-mark{width:34px;height:34px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
        ".brand-mark svg{width:19px;height:19px}",
        ".brand-text{min-width:0}",
        ".brand-text strong{display:block;font-size:.98rem;letter-spacing:.01em}",
        ".brand-text span{display:block;font-size:.72rem;color:var(--text-3)}",
        /* guild selector */
        ".guild-zone{padding:.8rem .8rem .2rem}",
        ".guild-select{position:relative}",
        ".guild-select summary{list-style:none;display:flex;align-items:center;gap:.65rem;padding:.55rem .6rem;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-2);cursor:pointer;min-width:0}",
        ".guild-select summary::-webkit-details-marker{display:none}",
        ".guild-select summary:hover{border-color:var(--accent)}",
        ".guild-select summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
        ".guild-icon{width:32px;height:32px;border-radius:9px;background:var(--surface-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:var(--text-2);flex-shrink:0;overflow:hidden}",
        ".guild-icon img{width:100%;height:100%;object-fit:cover}",
        ".guild-meta{min-width:0;flex:1}",
        ".guild-meta strong{display:block;font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".guild-meta span{display:block;font-size:.7rem;color:var(--text-3);font-family:var(--mono)}",
        ".guild-select summary>svg{width:15px;height:15px;color:var(--text-3);flex-shrink:0;transition:transform .15s ease}",
        ".guild-select[open] summary>svg{transform:rotate(180deg)}",
        ".menu{position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--surface-3);border:1px solid var(--border-strong);border-radius:var(--radius-md);box-shadow:var(--shadow-md);padding:.4rem;z-index:60}",
        ".menu-item{display:flex;align-items:center;gap:.6rem;width:100%;padding:.55rem .6rem;border-radius:var(--radius-sm);color:var(--text);font-size:.84rem;background:transparent;border:0;cursor:pointer;text-align:left;font-family:var(--font)}",
        ".menu-item:hover{background:rgba(255,255,255,.06)}",
        ".menu-item .tick{margin-left:auto;color:var(--success)}",
        ".menu-item .tick svg{width:15px;height:15px}",
        ".menu-note{font-size:.72rem;color:var(--text-3);padding:.45rem .6rem .3rem}",
        ".menu-sep{border:0;border-top:1px solid var(--border);margin:.35rem 0}",
        ".menu-head{font-size:.74rem;color:var(--text-2);padding:.45rem .6rem}",
        ".menu-head strong{color:var(--text);overflow-wrap:anywhere}",
        ".menu .btn{width:100%;margin-top:.3rem}",
        /* nav */
        ".side-nav{flex:1;overflow-y:auto;padding:.4rem .7rem .9rem}",
        ".nav-group{font-size:.68rem;font-weight:600;letter-spacing:.09em;color:var(--text-3);padding:.85rem .6rem .35rem;text-transform:uppercase}",
        ".nav-link{display:flex;align-items:center;gap:.7rem;padding:.55rem .6rem;border-radius:var(--radius-sm);color:var(--text-2);font-size:.9rem;font-weight:500;position:relative;margin-bottom:1px}",
        ".nav-link:hover{background:var(--surface-2);color:var(--text);text-decoration:none}",
        ".nav-link svg{width:17px;height:17px;flex-shrink:0}",
        ".nav-link.active{background:var(--accent-soft);color:var(--text)}",
        ".nav-link.active::before{content:'';position:absolute;left:-.7rem;top:.45rem;bottom:.45rem;width:3px;border-radius:3px;background:var(--accent)}",
        ".nav-link.active svg{color:var(--accent)}",
        /* sidebar footer */
        ".side-foot{border-top:1px solid var(--border);padding:.8rem}",
        ".user-chip{display:flex;align-items:center;gap:.65rem;min-width:0}",
        ".avatar{width:32px;height:32px;border-radius:50%;background:var(--surface-3);border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:var(--text-2);flex-shrink:0}",
        ".user-chip .who{min-width:0;flex:1}",
        ".user-chip .who strong{display:block;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".user-chip .who span{display:block;font-size:.7rem;color:var(--text-3)}",
        ".icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--text-2);cursor:pointer;flex-shrink:0}",
        ".icon-btn:hover{background:var(--surface-2);color:var(--text)}",
        ".icon-btn svg{width:18px;height:18px}",
        /* content column */
        ".app-content{flex:1;min-width:0;margin-left:248px;display:flex;flex-direction:column;transition:margin .18s ease}",
        "body.collapsed .app-content{margin-left:72px}",
        "body.collapsed .sidebar{width:72px}",
        "body.collapsed .brand-text,body.collapsed .nav-group,body.collapsed .nav-link span,body.collapsed .guild-zone,body.collapsed .side-foot .who{display:none}",
        "body.collapsed .nav-link{justify-content:center;padding:.6rem}",
        "body.collapsed .brand{justify-content:center;padding:1.05rem .5rem}",
        "body.collapsed .user-chip{justify-content:center}",
        "body.collapsed .side-foot .icon-btn{margin:0 auto}",
        /* topbar */
        ".topbar{position:sticky;top:0;z-index:30;background:rgba(11,13,18,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:.65rem 1.75rem;display:flex;align-items:center;gap:.8rem;min-width:0}",
        ".crumb{font-size:.86rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".crumb strong{color:var(--text);font-weight:600}",
        ".topbar .spacer{flex:1;min-width:.5rem}",
        ".top-search{display:flex;min-width:0}",
        ".top-search .search-box{max-width:260px}",
        /* user menu */
        ".user-menu{position:relative;flex-shrink:0}",
        ".user-menu summary{list-style:none;display:flex;align-items:center;gap:.55rem;padding:.3rem .5rem .3rem .3rem;border:1px solid transparent;border-radius:999px;cursor:pointer}",
        ".user-menu summary::-webkit-details-marker{display:none}",
        ".user-menu summary:hover{background:var(--surface-2);border-color:var(--border)}",
        ".user-menu summary>svg{width:14px;height:14px;color:var(--text-3)}",
        ".user-menu[open] summary>svg{transform:rotate(180deg)}",
        ".user-menu .menu{left:auto;right:0;min-width:250px}",
        ".logout-form{display:inline}",
        /* page */
        ".page-content{width:100%;max-width:1240px;margin:0 auto;padding:1.75rem;width:100%}",
        ".page-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:.9rem;margin-bottom:1.4rem}",
        ".page-head h1{font-size:1.45rem;font-weight:650;letter-spacing:-.01em}",
        ".page-head p{color:var(--text-2);font-size:.9rem;margin-top:.25rem;max-width:72ch}",
        ".page-actions{display:flex;gap:.6rem;flex-wrap:wrap}",
        /* grids + panels */
        ".stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.9rem;margin-bottom:1.1rem}",
        ".dashboard-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:1rem;margin-bottom:1.1rem;align-items:start}",
        ".dashboard-grid>*{min-width:0}",
        ".stack{display:flex;flex-direction:column;gap:1rem;min-width:0}",
        ".panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-sm);min-width:0}",
        ".panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem;padding:1rem 1.25rem .2rem}",
        ".panel-header h2{font-size:.95rem;font-weight:650}",
        ".panel-header p{font-size:.8rem;color:var(--text-2);margin-top:.15rem}",
        ".panel-header .more{font-size:.8rem;white-space:nowrap;flex-shrink:0;margin-top:.15rem}",
        ".panel-body{padding:.9rem 1.25rem 1.2rem}",
        ".panel-footer{border-top:1px solid var(--border);padding:.7rem 1.25rem;font-size:.78rem;color:var(--text-3)}",
        ".stat-card{display:flex;gap:.9rem;align-items:flex-start;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-sm);padding:1.05rem 1.15rem;min-width:0}",
        ".stat-card .ic{width:36px;height:36px;border-radius:9px;background:var(--surface-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0}",
        ".stat-card .ic svg{width:18px;height:18px}",
        ".stat-card .lb{font-size:.72rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3)}",
        ".stat-card .vl{font-size:1.6rem;font-weight:700;letter-spacing:-.02em;line-height:1.25;font-variant-numeric:tabular-nums}",
        ".stat-card .sb{font-size:.76rem;color:var(--text-2)}",
        ".dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block}",
        ".dot.on{background:var(--success);box-shadow:0 0 8px rgba(59,165,93,.7)}",
        ".dot.off{background:var(--text-3)}",
        ".kv{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.52rem 0;border-bottom:1px solid var(--border);font-size:.86rem}",
        ".kv:last-child{border-bottom:0}",
        ".kv dt{color:var(--text-2);flex-shrink:0}",
        ".kv dd{font-family:var(--mono);font-size:.79rem;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:62%;min-width:0}",
        ".kv dd.plain{font-family:var(--font)}",
        /* tables */
        ".table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}",
        "table{width:100%;border-collapse:collapse;font-size:.86rem;min-width:600px}",
        "th,td{padding:.62rem .9rem;text-align:left;border-bottom:1px solid var(--border);vertical-align:middle}",
        "tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}",
        "thead th{background:var(--surface-2);color:var(--text-3);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}",
        "tbody tr{transition:background .12s ease}",
        "tbody tr:hover{background:var(--surface-2)}",
        "td.mono{font-family:var(--mono);font-size:.79rem}",
        ".truncate{max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".sub{font-size:.74rem;color:var(--text-3);margin-top:.1rem}",
        /* badges */
        ".badge{display:inline-flex;align-items:center;gap:.3rem;padding:.14rem .55rem;border-radius:999px;font-size:.72rem;font-weight:650;letter-spacing:.02em;white-space:nowrap}",
        ".b-open{background:var(--info-soft);color:#8fb4ff}",
        ".b-claimed{background:var(--accent-soft);color:#a3abff}",
        ".b-progress{background:var(--warning-soft);color:#f5c04c}",
        ".b-waiting{background:var(--warning-soft);color:#f5c04c}",
        ".b-resolved,.b-success{background:var(--success-soft);color:#6fd598}",
        ".b-closed,.b-muted{background:rgba(255,255,255,.07);color:var(--text-2)}",
        ".b-high{background:var(--warning-soft);color:#f5c04c}",
        ".b-urgent,.b-danger{background:var(--danger-soft);color:#ff8a8d}",
        ".b-low{background:rgba(255,255,255,.07);color:var(--text-3)}",
        /* activity timeline */
        ".timeline{list-style:none;display:flex;flex-direction:column}",
        ".timeline li{position:relative;display:flex;gap:.8rem;padding:.65rem 0 .65rem 1.4rem;font-size:.86rem}",
        ".timeline li::before{content:'';position:absolute;left:5px;top:1.15rem;width:7px;height:7px;border-radius:50%;background:var(--surface-3);border:2px solid var(--text-3)}",
        ".timeline li::after{content:'';position:absolute;left:8px;top:1.9rem;bottom:-.35rem;width:1px;background:var(--border-strong)}",
        ".timeline li:last-child::after{display:none}",
        ".timeline .fb{min-width:0}",
        ".timeline .fb strong{font-weight:600}",
        ".timeline .fm{font-size:.75rem;color:var(--text-3);margin-top:.12rem}",
        /* actions */
        ".action-list{display:flex;flex-direction:column;gap:.55rem}",
        ".action-link{display:flex;align-items:center;gap:.7rem;padding:.65rem .8rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text);font-size:.87rem;font-weight:550}",
        ".action-link:hover{border-color:var(--border-strong);text-decoration:none;background:var(--surface-3)}",
        ".action-link svg{width:16px;height:16px;color:var(--accent);flex-shrink:0}",
        ".action-link small{display:block;font-weight:400;color:var(--text-2);font-size:.76rem}",
        /* buttons/inputs */
        ".btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;padding:.5rem 1rem;border-radius:8px;border:1px solid transparent;font-size:.85rem;font-weight:600;cursor:pointer;font-family:var(--font);transition:background .15s ease,border-color .15s ease;white-space:nowrap}",
        ".btn-primary{background:var(--accent);color:#fff}",
        ".btn-primary:hover{background:var(--accent-hover)}",
        ".btn-secondary{background:var(--surface-3);color:var(--text);border-color:var(--border-strong)}",
        ".btn-secondary:hover{background:#262c3b}",
        ".btn-danger{background:transparent;color:#ff8a8d;border-color:rgba(237,66,69,.4)}",
        ".btn-danger:hover{background:var(--danger-soft)}",
        ".btn-sm{padding:.32rem .7rem;font-size:.78rem}",
        ".btn svg{width:15px;height:15px}",
        ".btn[disabled]{opacity:.6;cursor:wait}",
        ".btn.is-loading{pointer-events:none;opacity:.7}",
        ".field{margin-bottom:1rem}",
        ".field:last-child{margin-bottom:0}",
        ".field>label,.field>.lbl{display:block;font-size:.84rem;font-weight:600;margin-bottom:.15rem}",
        ".field .hint{display:block;font-size:.76rem;color:var(--text-3);margin-bottom:.45rem;font-weight:400}",
        ".input,.select,textarea.input{width:100%;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:8px;color:var(--text);font-size:.87rem;font-family:var(--font);padding:.55rem .7rem;min-width:0}",
        ".input:focus,.select:focus,textarea.input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}",
        ".input::placeholder{color:var(--text-3)}",
        "textarea.input{font-family:var(--mono);font-size:.78rem;resize:vertical}",
        ".select{appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%239aa1ad' stroke-width='1.6'/></svg>\");background-repeat:no-repeat;background-position:right .7rem center;padding-right:2rem}",
        ".form-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 1rem}",
        ".switch-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.6rem 0;border-bottom:1px solid var(--border)}",
        ".switch-row:last-child{border-bottom:0}",
        ".switch-row .t{min-width:0}",
        ".switch-row .t strong{display:block;font-size:.86rem;font-weight:600}",
        ".switch-row .t small{display:block;font-size:.76rem;color:var(--text-3);font-family:var(--mono)}",
        ".switch{position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0}",
        ".switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}",
        ".switch .track{position:absolute;inset:0;border-radius:999px;background:var(--surface-3);border:1px solid var(--border-strong);transition:background .15s ease}",
        ".switch .track::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--text-2);transition:transform .15s ease,background .15s ease}",
        ".switch input:checked+.track{background:var(--accent)}",
        ".switch input:checked+.track::after{transform:translateX(18px);background:#fff}",
        ".switch input:focus-visible+.track{outline:2px solid var(--accent);outline-offset:2px}",
        ".savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:.8rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:.8rem 1rem;margin-top:1.1rem;flex-wrap:wrap}",
        ".form-status{font-size:.83rem;color:var(--text-2)}",
        ".form-status.ok{color:#6fd598}",
        ".form-status.err{color:#ff8a8d}",
        ".toolbar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:.9rem}",
        ".search-box{position:relative;flex:1;min-width:200px;max-width:340px}",
        ".search-box>svg{position:absolute;left:.65rem;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--text-3);pointer-events:none}",
        ".search-box .input{padding-left:2.1rem}",
        ".count-note{font-size:.8rem;color:var(--text-3);margin-top:.7rem}",
        /* dropdown (shared with guild-select/user-menu via .menu) */
        "details.dropdown{position:relative}",
        "details.dropdown summary{list-style:none;cursor:pointer}",
        "details.dropdown summary::-webkit-details-marker{display:none}",
        /* modal */
        ".modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:80;display:flex;align-items:center;justify-content:center;padding:1rem}",
        ".modal-backdrop[hidden]{display:none}",
        ".modal{background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);max-width:420px;width:100%;padding:1.4rem}",
        ".modal h2{font-size:1rem;margin-bottom:.4rem}",
        ".modal p{font-size:.85rem;color:var(--text-2);margin-bottom:1.2rem}",
        ".modal-actions{display:flex;justify-content:flex-end;gap:.6rem}",
        /* toasts */
        "#toasts{position:fixed;right:1rem;bottom:1rem;z-index:90;display:flex;flex-direction:column;gap:.55rem;max-width:min(360px,calc(100vw - 2rem))}",
        ".toast{display:flex;gap:.6rem;align-items:flex-start;background:var(--surface-3);border:1px solid var(--border-strong);border-radius:10px;padding:.7rem .9rem;font-size:.84rem;box-shadow:var(--shadow-md);animation:tin .18s ease}",
        ".toast.ok{border-color:rgba(59,165,93,.5)}",
        ".toast.err{border-color:rgba(237,66,69,.5)}",
        ".toast.warn{border-color:rgba(250,168,26,.5)}",
        ".toast.info{border-color:rgba(91,140,255,.5)}",
        "@keyframes tin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
        /* skeletons */
        ".skel{position:relative;overflow:hidden;background:var(--surface-3);border-radius:6px;min-height:.9em}",
        ".skel::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);animation:shimmer 1.4s infinite}",
        "@keyframes shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}",
        ".skel-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:1.15rem;display:flex;flex-direction:column;gap:.6rem}",
        /* states */
        ".empty{border:1px dashed var(--border-strong);border-radius:var(--radius-md);padding:2.2rem 1.5rem;text-align:center;background:var(--surface)}",
        ".empty .ei{width:40px;height:40px;border-radius:11px;background:var(--surface-3);display:inline-flex;align-items:center;justify-content:center;color:var(--text-3);margin-bottom:.7rem}",
        ".empty .ei svg{width:20px;height:20px}",
        ".empty h3{font-size:.95rem;margin-bottom:.3rem}",
        ".empty p{font-size:.83rem;color:var(--text-2);max-width:46ch;margin:0 auto}",
        ".empty .btn{margin-top:1rem}",
        ".center-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}",
        ".center-card{max-width:430px;width:100%;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:2.4rem 2rem}",
        ".center-card .code{font-size:3rem;font-weight:750;letter-spacing:-.03em}",
        ".center-card h1{font-size:1.2rem;margin:.4rem 0 .5rem}",
        ".center-card p{color:var(--text-2);font-size:.88rem;margin-bottom:1.4rem}",
        ".brand-row{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-bottom:1.2rem}",
        ".overlay{display:none}",
        "#navToggle{display:none}",
        "#collapseToggle{display:inline-flex}",
        "code.mono{font-family:var(--mono);font-size:.8rem;background:var(--surface-3);border:1px solid var(--border);border-radius:6px;padding:.1rem .4rem}",
        "pre.codeblock{font-family:var(--mono);font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:.8rem;overflow-x:auto;color:var(--text-2);max-height:220px;overflow-y:auto}",
        /* responsive */
        "@media (max-width:1100px){.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-grid{grid-template-columns:minmax(0,1fr)}}",
        "@media (max-width:1024px){",
        ".sidebar{transform:translateX(-100%);width:250px}",
        "body.collapsed .sidebar{width:250px}",
        "body.collapsed .brand-text,body.collapsed .nav-group,body.collapsed .nav-link span,body.collapsed .guild-zone,body.collapsed .side-foot .who{display:block}",
        "body.collapsed .nav-link{justify-content:flex-start}",
        ".sidebar.open{transform:none;box-shadow:0 0 60px rgba(0,0,0,.6)}",
        ".app-content,body.collapsed .app-content{margin-left:0}",
        "#navToggle{display:inline-flex}",
        "#collapseToggle{display:none}",
        ".overlay.show{display:block;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:35}",
        "}",
        "@media (max-width:640px){.page-content{padding:1.1rem}.stat-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.7rem}.stat-card .vl{font-size:1.3rem}.form-grid{grid-template-columns:minmax(0,1fr)}.topbar{padding:.65rem 1rem}.top-search{display:none}.guild-pill .gid-full{display:none}.guild-pill .gid-short{display:inline}.page-head h1{font-size:1.2rem}}",
        "@media (max-width:420px){.stat-grid{grid-template-columns:minmax(0,1fr)}}",
        "@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}",
    ].join("");
}

function navItem(href, icon, label, active) {
    return `<a class="nav-link${active ? " active" : ""}" href="${esc(href)}"${active ? ' aria-current="page"' : ""}>${icon}<span>${esc(label)}</span></a>`;
}

function guildSelector(gid, info) {
    const name = info?.name || "Server";
    const sub = gid ? shortId(gid) : "none";
    const initial = esc((info?.name || "S").slice(0, 2).toUpperCase());
    const iconHtml = info?.icon
        ? `<span class="guild-icon"><img src="${esc(info.icon)}" alt="" loading="lazy"></span>`
        : `<span class="guild-icon" aria-hidden="true">${initial}</span>`;
    return `<div class="guild-zone"><details class="guild-select"><summary aria-label="Current server: ${esc(name)}">`
        + `${iconHtml}<span class="guild-meta"><strong>${esc(name)}</strong><span>${esc(sub)}</span></span>${ICONS.chevron}`
        + `</summary><div class="menu" role="menu">`
        + (gid
            ? `<div class="menu-item" role="menuitem" aria-current="true">${iconHtml}<span><strong>${esc(name)}</strong><br><small style="color:var(--text-3);font-family:var(--mono);font-size:.7rem">${esc(gid)}</small></span><span class="tick">${ICONS.check}</span></div><p class="menu-note">This session manages one server. Additional servers appear here as you authorize them.</p>`
            : `<p class="menu-note">No server linked to this session yet.</p>`)
        + `</div></details></div>`;
}

function userMenu(session) {
    const userShort = shortId(session.userId);
    const initial = esc(String(session.userId || "?").slice(0, 2).toUpperCase());
    return `<details class="user-menu dropdown"><summary aria-label="Account menu" aria-haspopup="menu"><span class="avatar" aria-hidden="true">${initial}</span>${ICONS.chevron}</summary>`
        + `<div class="menu" role="menu"><div class="menu-head">Signed in as<br><strong>User ${esc(userShort)}</strong></div><hr class="menu-sep">`
        + `<div class="menu-head">Session expires<br><strong>${relTime(session.expiresAt)}</strong></div><hr class="menu-sep">`
        + `<form class="logout-form" action="/auth/logout" method="POST"><button type="submit" class="btn btn-secondary btn-sm">Log out</button></form></div></details>`;
}

function shell(opts) {
    const gid = opts.gid || null;
    const g = (p) => gid ? "/dashboard/guild/" + gid + "/" + p : "/dashboard";
    const nav = [
        `<p class="nav-group" id="ng-overview">Overview</p><div role="group" aria-labelledby="ng-overview">`,
        navItem("/dashboard", ICONS.dashboard, "Dashboard", opts.active === "dashboard"),
        `</div><p class="nav-group" id="ng-manage">Management</p><div role="group" aria-labelledby="ng-manage">`,
        navItem(g("tickets"), ICONS.ticket, "Tickets", opts.active === "tickets"),
        navItem(g("moderation/cases/recent"), ICONS.shield, "Moderation", opts.active === "moderation"),
        navItem(g("logs/mod"), ICONS.log, "Mod Log", opts.active === "logs"),
        `</div><p class="nav-group" id="ng-config">Configuration</p><div role="group" aria-labelledby="ng-config">`,
        navItem(g("config"), ICONS.settings, "Server Settings", opts.active === "settings"),
        `</div>`,
    ].join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(opts.title)} — .pulse</title><style>${getStyles()}</style></head><body>`
        + `<a class="skip-link" href="#main">Skip to content</a>`
        + `<div class="app-shell">`
        + `<aside class="sidebar" id="sidebar" aria-label="Primary"><div class="brand"><div class="brand-mark" aria-hidden="true">${ICONS.pulse}</div><div class="brand-text"><strong>.pulse</strong><span>Control Panel</span></div></div>`
        + guildSelector(gid, opts.guildInfo)
        + `<nav class="side-nav" aria-label="Dashboard sections">${nav}</nav>`
        + `<div class="side-foot"><div class="user-chip"><div class="avatar" aria-hidden="true">${esc(String(opts.session.userId || "?").slice(0, 2).toUpperCase())}</div><div class="who"><strong>User ${esc(shortId(opts.session.userId))}</strong><span>Discord account</span></div><form class="logout-form" action="/auth/logout" method="POST"><button type="submit" class="icon-btn" aria-label="Log out" title="Log out">${ICONS.logout}</button></form></div></div></aside>`
        + `<div class="overlay" id="overlay"></div>`
        + `<div class="app-content"><header class="topbar">`
        + `<button class="icon-btn" id="navToggle" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${ICONS.menu}</button>`
        + `<button class="icon-btn" id="collapseToggle" aria-label="Collapse sidebar">${ICONS.collapse}</button>`
        + `<nav class="crumb" aria-label="Breadcrumb">Pulse <span aria-hidden="true">/</span> <strong>${esc(opts.crumb)}</strong></nav>`
        + `<div class="spacer"></div>`
        + (gid
            ? `<form class="top-search" action="/dashboard/guild/${esc(gid)}/tickets" method="GET" role="search"><div class="search-box">${ICONS.search}<input class="input" name="q" type="search" placeholder="Search tickets…" aria-label="Search tickets" autocomplete="off"></div></form>`
            : ``)
        + (opts.guildInfo?.name
            ? `<span class="guild-pill"><span class="dot on" aria-hidden="true"></span><span class="gid-full">${esc(opts.guildInfo.name)}</span><span class="gid-short">${esc(shortId(gid))}</span></span>`
            : (gid
                ? `<span class="guild-pill" title="Guild ID ${esc(gid)}"><span class="dot on" aria-hidden="true"></span><span class="gid-full"><code class="mono" style="border:0;background:none;padding:0">${esc(gid)}</code></span><span class="gid-short">${esc(shortId(gid))}</span></span>`
                : `<span class="guild-pill"><span class="dot off" aria-hidden="true"></span>No server</span>`))
        + userMenu(opts.session)
        + `</header><main class="page-content" id="main" tabindex="-1">${opts.content}</main></div></div>`
        + `<div id="toasts" role="status" aria-live="polite"></div>`
        + `<div class="modal-backdrop" id="confirmModal" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle"><h2 id="confirmTitle">Are you sure?</h2><p id="confirmDesc"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-modal-close>Cancel</button><button type="button" class="btn btn-danger" id="confirmYes">Confirm</button></div></div></div>`
        + `<script>${clientScript()}<\/script></body></html>`;
}

function clientScript() {
    return [
        "(function(){",
        "var sidebar=document.getElementById('sidebar'),overlay=document.getElementById('overlay'),navToggle=document.getElementById('navToggle');",
        "function closeDrawer(){if(!sidebar)return;sidebar.classList.remove('open');if(overlay)overlay.classList.remove('show');if(navToggle)navToggle.setAttribute('aria-expanded','false');}",
        "if(navToggle&&sidebar){navToggle.addEventListener('click',function(){var open=sidebar.classList.toggle('open');if(overlay)overlay.classList.toggle('show',open);navToggle.setAttribute('aria-expanded',open?'true':'false');});}",
        "if(overlay)overlay.addEventListener('click',closeDrawer);",
        "document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeDrawer();closeModal();}});",
        "document.addEventListener('click',function(e){if(e.target&&e.target.hasAttribute&&e.target.hasAttribute('data-modal-close'))closeModal();});",
        "var collapse=document.getElementById('collapseToggle');",
        "try{if(localStorage.getItem('pulse:collapsed')==='1')document.body.classList.add('collapsed');}catch(e){}",
        "if(collapse)collapse.addEventListener('click',function(){document.body.classList.toggle('collapsed');try{localStorage.setItem('pulse:collapsed',document.body.classList.contains('collapsed')?'1':'0');}catch(e){}});",
        // close other <details> menus when one opens
        "document.querySelectorAll('details.guild-select,details.user-menu').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open)return;document.querySelectorAll('details.guild-select,details.user-menu').forEach(function(o){if(o!==d&&o.open)o.open=false;});});});",
        "window.toast=function(msg,type){var box=document.getElementById('toasts');if(!box)return;var el=document.createElement('div');el.className='toast '+(type||'');el.textContent=msg;box.appendChild(el);setTimeout(function(){el.remove();},4200);};",
        // confirm modal: [data-confirm] -> modal -> on confirm run data-confirm-action
        "var modal=document.getElementById('confirmModal'),mTitle=document.getElementById('confirmTitle'),mDesc=document.getElementById('confirmDesc'),mYes=document.getElementById('confirmYes'),pending=null;",
        "function closeModal(){if(!modal)return;modal.hidden=true;pending=null;}",
        "window.closeModal=closeModal;",
        "document.querySelectorAll('[data-confirm]').forEach(function(el){el.addEventListener('click',function(e){e.preventDefault();if(!modal)return;mTitle.textContent=el.getAttribute('data-confirm-title')||'Are you sure?';mDesc.textContent=el.getAttribute('data-confirm')||'';pending=el;modal.hidden=false;var c=modal.querySelector('[data-modal-close]');if(c)c.focus();});});",
        "if(mYes)mYes.addEventListener('click',function(){var el=pending;closeModal();if(!el)return;var fn=el.getAttribute('data-confirm-action');if(fn==='reset-form'){var f=document.getElementById(el.getAttribute('data-form')||'');if(f){f.reset();window.toast('Unsaved changes discarded.','info');var s=document.getElementById('formStatus');if(s){s.className='form-status';s.textContent='';}}}else if(fn&&window[fn]){window[fn](el);}});",
        "if(modal)modal.addEventListener('click',function(e){if(e.target===modal)closeModal();});",
        // relative timestamps (progressive enhancement; server renders absolute text)
        "function rel(d){var s=Math.floor((Date.now()-d.getTime())/1000);if(s<0)s=0;if(s<60)return s+'s ago';var m=Math.floor(s/60);if(m<60)return m+'m ago';var h=Math.floor(m/60);if(h<24)return h+'h ago';var days=Math.floor(h/24);if(days<30)return days+'d ago';return d.toLocaleDateString();}",
        "try{document.querySelectorAll('time[data-rel]').forEach(function(t){var d=new Date(t.getAttribute('datetime'));if(!isNaN(d))t.textContent=rel(d);});}catch(e){}",
        // tickets filter (prefilled from ?q= by the server)
        "var q=document.getElementById('ticketSearch'),sf=document.getElementById('statusFilter'),pf=document.getElementById('priorityFilter');",
        "if(q||sf||pf){var rows=Array.prototype.slice.call(document.querySelectorAll('#ticketTable tbody tr[data-search]'));var count=document.getElementById('ticketCount');var empty=document.getElementById('noFilterResults');",
        "function apply(){var needle=(q&&q.value||'').trim().toLowerCase(),st=sf?sf.value:'',pr=pf?pf.value:'';var n=0;",
        "rows.forEach(function(r){var ok=(!needle||r.getAttribute('data-search').indexOf(needle)>-1)&&(!st||r.getAttribute('data-status')===st)&&(!pr||r.getAttribute('data-priority')===pr);r.style.display=ok?'':'none';if(ok)n++;});",
        "if(count)count.textContent=n+' shown';if(empty)empty.style.display=n===0?'':'none';}",
        "if(q)q.addEventListener('input',apply);if(sf)sf.addEventListener('change',apply);if(pf)pf.addEventListener('change',apply);apply();}",
        // moderation case search (same pattern, single input)
        "var cq=document.getElementById('caseSearch');",
        "if(cq){var crows=Array.prototype.slice.call(document.querySelectorAll('#caseTable tbody tr[data-search]'));",
        "function capply(){var needle=cq.value.trim().toLowerCase();crows.forEach(function(r){r.style.display=(!needle||r.getAttribute('data-search').indexOf(needle)>-1)?'':'none';});}",
        "cq.addEventListener('input',capply);capply();}",
        // settings form -> real PATCH API
        "var form=document.getElementById('settingsForm');",
        "if(form){form.addEventListener('submit',function(e){e.preventDefault();var btn=document.getElementById('saveSettings'),status=document.getElementById('formStatus');",
        "if(btn){btn.disabled=true;btn.classList.add('is-loading');}",
        "if(status){status.className='form-status';status.textContent='Saving…';}",
        "var fd=new FormData(form);function str(k){var v=(fd.get(k)||'').toString().trim();return v==='' ? null : v;}",
        "function idList(k){var v=(fd.get(k)||'').toString().split(',').map(function(s){return s.trim();}).filter(Boolean);return JSON.stringify(v);}",
        "var payload={prefix:str('prefix')||'!',logChannelId:str('logChannelId'),modLogChannelId:str('modLogChannelId'),welcomeChannelId:str('welcomeChannelId'),goodbyeChannelId:str('goodbyeChannelId'),ticketCategoryId:str('ticketCategoryId'),ticketLogChannelId:str('ticketLogChannelId'),staffRoleIds:idList('staffRoleIds'),moderatorRoleIds:idList('moderatorRoleIds')};",
        "var mods={};form.querySelectorAll('input[data-module]').forEach(function(t){mods[t.getAttribute('data-module')]=t.checked;});",
        "if(Object.keys(mods).length)payload.modules=JSON.stringify(mods);",
        "fetch(form.action,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'}).then(function(r){return r.json().then(function(j){return {ok:r.ok,body:j};});}).then(function(out){",
        "if(btn){btn.disabled=false;btn.classList.remove('is-loading');}",
        "if(out.ok){if(status){status.className='form-status ok';status.textContent='Saved.';}window.toast('Settings saved.','ok');}",
        "else{if(status){status.className='form-status err';status.textContent=(out.body&&out.body.error)||'Save failed.';}window.toast((out.body&&out.body.error)||'Save failed.','err');}",
        "}).catch(function(){if(btn){btn.disabled=false;btn.classList.remove('is-loading');}if(status){status.className='form-status err';status.textContent='Network error.';}window.toast('Network error while saving.','err');});});}",
        "})();",
    ].join("\n");
}

function statusBadge(status) {
    const s = String(status || "OPEN").toUpperCase();
    const cls = s === "OPEN" ? "b-open" : s === "CLAIMED" ? "b-claimed" : s === "IN_PROGRESS" ? "b-progress" : s === "WAITING" ? "b-waiting" : s === "RESOLVED" ? "b-resolved" : s === "CLOSED" ? "b-closed" : "b-muted";
    return `<span class="badge ${cls}">${esc(s.replace("_", " "))}</span>`;
}

function priorityBadge(priority) {
    const p = String(priority || "NORMAL").toUpperCase();
    const cls = p === "URGENT" ? "b-urgent" : p === "HIGH" ? "b-high" : p === "LOW" ? "b-low" : "b-muted";
    return `<span class="badge ${cls}">${esc(p)}</span>`;
}

function emptyState(icon, title, text, actionHtml) {
    return `<div class="empty"><div class="ei">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml || ""}</div>`;
}

function errorHandler(err, req, res, next) {
    logger.error("error", err.message, err.stack);
    if (isApiRoute(req)) return res.status(500).json({ error: "Internal error." });
    res.status(500).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Error — .pulse</title><style>${getStyles()}</style></head><body><div class="center-wrap"><div class="center-card"><div class="brand-row"><div class="brand-mark" style="width:34px;height:34px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">p</div><strong>.pulse</strong></div><div class="code">500</div><h1>Something went wrong</h1><p>An unexpected error occurred. It has been logged — try again, or return to the dashboard.</p><a class="btn btn-primary" href="/dashboard">Back to Dashboard</a></div></div></body></html>`);
}

function errorPage(msg, code) {
    const c = code || "Error";
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(c)} — .pulse</title><style>${getStyles()}</style></head><body><div class="center-wrap"><div class="center-card"><div class="brand-row"><div class="brand-mark" style="width:34px;height:34px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">p</div><strong>.pulse</strong></div><div class="code">${esc(c)}</div><h1>${esc(c === "404" ? "Page not found" : c === "403" ? "Access denied" : "Something went wrong")}</h1><p>${esc(msg)}</p><a class="btn btn-primary" href="/dashboard">Back to Dashboard</a></div></div></body></html>`;
}

function oauthErrorPage(title, text) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sign in — .pulse</title><style>${getStyles()}</style></head><body><div class="center-wrap"><div class="center-card"><div class="brand-row"><div class="brand-mark" style="width:34px;height:34px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">p</div><strong>.pulse</strong></div><div class="code" style="font-size:1.6rem">${esc(title)}</div><p>${esc(text)}</p><a class="btn btn-primary" href="/auth/discord">Try again</a></div></div></body></html>`;
}

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
            return res.status(400).send(oauthErrorPage("Sign-in failed", "Invalid sign-in state. Please try again."));
        }
        if (!code) {
            return res.status(400).send(oauthErrorPage("Sign-in cancelled", "Authorization was denied or no code was provided."));
        }
        const tok = await discordTokenExchange(code);
        if (tok.error) {
            return res.status(400).send(oauthErrorPage("Sign-in failed", tok.error_description || tok.error));
        }
        const user = await fetchDiscordUser(tok.access_token);
        const guilds = await fetchDiscordGuilds(tok.access_token);
        const session = await createSession(user.id, guilds[0]?.id || null);
        res.cookie("session_token", session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_TTL_MS, signed: true, path: "/" });
        res.redirect("/dashboard");
    } catch (e) {
        logger.error("oauth", "callback", e);
        res.status(500).send(oauthErrorPage("Sign-in failed", "Failed to complete authentication. Please try again."));
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

expressApp.get("/api/guild/:guildId/config", async (req, res) => { try { res.json(await settings.get(req.params.guildId)); } catch (e) { res.status(500).json({ error: "Failed." }); } });
expressApp.patch("/api/guild/:guildId/config", async (req, res) => { try { await settings.patch(req.params.guildId, req.body); res.json(await settings.get(req.params.guildId)); } catch (e) { res.status(500).json({ error: "Failed." }); } });

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

// ── Dashboard pages (same data fetching as before; presentation overhauled) ──

expressApp.get("/dashboard", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const gid = req.guildId || session.guildId;
        const guildInfo = gid ? getGuildInfo(gid) : null;
        const bot = await getBotStatus();
        const config = gid ? await settings.get(gid).catch(() => null) : null;
        const openTickets = gid ? await tickets.getOpenTicketsSummary(gid, 10).catch(() => []) : [];
        const recentCases = gid ? await moderation.getRecentCasesApi(gid, 5).catch(() => []) : [];
        const stats = gid ? await tickets.getStats(gid).catch(() => ({ open: 0, closed: 0, total: 0, avgRating: null, ratedCount: 0 })) : { open: 0, closed: 0, total: 0, avgRating: null, ratedCount: 0 };

        const botCard = bot.online
            ? { value: "Online", sub: bot.ping != null ? `${bot.ping} ms latency` : "connected", icon: ICONS.pulse, live: true }
            : { value: "Starting", sub: "bot not connected yet", icon: ICONS.pulse, live: false };
        const statCards = [
            { label: "Open tickets", value: String(stats.open ?? 0), sub: "needs attention", icon: ICONS.ticket },
            { label: "Closed tickets", value: String(stats.closed ?? 0), sub: `${stats.total ?? (stats.open ?? 0) + (stats.closed ?? 0)} total`, icon: ICONS.check },
            { label: "Recent cases", value: String(recentCases.length), sub: "latest moderation activity", icon: ICONS.shield },
            { label: "Bot status", value: botCard.value, sub: botCard.sub, icon: botCard.icon, live: botCard.live },
        ].map((c) => `<div class="stat-card"><div class="ic" aria-hidden="true">${c.icon}</div><div style="min-width:0"><div class="lb">${esc(c.label)}</div><div class="vl">${c.live === true ? `<span class="dot on" aria-hidden="true"></span> ` : c.live === false ? `<span class="dot off" aria-hidden="true"></span> ` : ""}${esc(c.value)}</div><div class="sb">${esc(c.sub)}</div></div></div>`).join("");

        const ticketRows = openTickets.map((t) => {
            const staff = t.claimedById || t.assignedById;
            return `<tr><td class="mono">#${esc(String(t.id).slice(0, 8))}</td><td>${statusBadge(t.status)}</td><td><div>${esc(shortId(t.openerId))}</div><div class="sub">${staff ? "→ " + esc(shortId(staff)) : "Unassigned"}</div></td><td>${priorityBadge(t.priority)}</td><td>${relTime(t.createdAt)}</td></tr>`;
        }).join("");
        const ticketsPanel = `<div class="panel"><div class="panel-header"><div><h2>Recent tickets</h2><p>${openTickets.length} open${stats.avgRating != null ? ` · avg rating ${Number(stats.avgRating).toFixed(1)} from ${stats.ratedCount || 0} ratings` : ""}</p></div>${gid ? `<a class="more" href="/dashboard/guild/${esc(gid)}/tickets">View all tickets →</a>` : ""}</div><div class="panel-body">`
            + (openTickets.length === 0
                ? emptyState(ICONS.ticket, "No open tickets", "New support tickets will appear here as soon as members open them.")
                : `<div class="table-wrap"><table><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Creator</th><th scope="col">Priority</th><th scope="col">Opened</th></tr></thead><tbody>${ticketRows}</tbody></table></div>`)
            + `</div></div>`;

        const caseFeed = recentCases.length === 0
            ? emptyState(ICONS.shield, "No moderation actions yet", "Cases will appear here once moderators take action.")
            : `<ol class="timeline">${recentCases.map((c) => `<li><div class="fb"><strong>#${esc(c.caseNumber)} ${esc(c.action || "Action")}</strong> — ${esc(c.targetTag || c.targetId || "unknown")}<div class="fm">Moderator ${esc(c.moderatorTag || "unknown")} · ${relTime(c.createdAt)}${c.reason ? ` · ${esc(String(c.reason).slice(0, 90))}` : ""}${c.resolved ? " · resolved" : ""}</div></div></li>`).join("")}</ol>`;
        const modPanel = `<div class="panel"><div class="panel-header"><div><h2>Recent moderation</h2><p>Latest moderation events</p></div>${gid ? `<a class="more" href="/dashboard/guild/${esc(gid)}/moderation/cases/recent">View all</a>` : ""}</div><div class="panel-body">${caseFeed}</div></div>`;

        const channelFields = ["logChannelId", "modLogChannelId", "welcomeChannelId", "goodbyeChannelId", "ticketCategoryId", "ticketLogChannelId"];
        const channelsSet = config ? channelFields.filter((k) => config[k]).length : 0;
        const staffCount = config && Array.isArray(config.staffRoleIds) ? config.staffRoleIds.length : 0;
        const modCount = config && Array.isArray(config.moderatorRoleIds) ? config.moderatorRoleIds.length : 0;
        const serverPanel = `<div class="panel"><div class="panel-header"><div><h2>Server</h2><p>Configuration snapshot</p></div>${gid ? `<a class="more" href="/dashboard/guild/${esc(gid)}/config">Settings</a>` : ""}</div><div class="panel-body">`
            + (!gid
                ? emptyState(ICONS.alert, "No server selected", "Your session is not linked to a server yet.")
                : !config
                    ? emptyState(ICONS.alert, "No configuration yet", "Server configuration will appear here once the bot sees this server.")
                    : `<dl>${[
                        ["Server", guildInfo?.name ? esc(guildInfo.name) : esc(shortId(gid)), true],
                        ["Members", guildInfo?.memberCount != null ? guildInfo.memberCount.toLocaleString() : "unknown", true],
                        ["Command prefix", `<code class="mono">${esc(config.prefix || "!")}</code>`, false],
                        ["Channels configured", `${channelsSet} of 6`, true],
                        ["Staff roles", `${staffCount}`, true],
                        ["Moderator roles", `${modCount}`, true],
                    ].map(([k, v, plain]) => `<div class="kv"><dt>${esc(k)}</dt><dd class="${plain ? "plain" : ""}">${v}</dd></div>`).join("")}</dl>`)
            + `</div></div>`;

        const botPanel = `<div class="panel"><div class="panel-header"><div><h2>Bot status</h2><p>Live process state</p></div></div><div class="panel-body"><dl>`
            + `<div class="kv"><dt>Bot</dt><dd class="plain">${bot.online ? '<span class="badge b-success">Online</span>' : '<span class="badge b-muted">Starting</span>'}</dd></div>`
            + `<div class="kv"><dt>Account</dt><dd>${bot.tag ? esc(bot.tag) : "—"}</dd></div>`
            + `<div class="kv"><dt>Discord latency</dt><dd class="plain">${bot.ping != null ? bot.ping + " ms" : "—"}</dd></div>`
            + `<div class="kv"><dt>Uptime</dt><dd class="plain">${bot.uptimeMs != null ? esc(fmtUptime(bot.uptimeMs)) : "—"}</dd></div>`
            + `<div class="kv"><dt>Servers cached</dt><dd class="plain">${bot.guilds != null ? bot.guilds : "—"}</dd></div>`
            + `<div class="kv"><dt>Database</dt><dd class="plain">${bot.dbOk ? '<span class="badge b-success">Connected</span>' : '<span class="badge b-danger">Offline</span>'}</dd></div>`
            + `</dl></div></div>`;

        const headDesc = gid
            ? `Overview for ${guildInfo?.name ? `<strong>${esc(guildInfo.name)}</strong> · ` : ""}${guildInfo?.memberCount != null ? `${guildInfo.memberCount.toLocaleString()} members · ` : ""}live data from .pulse.`
            : "Sign in to see your server overview.";
        const content = `<div class="page-head"><div><h1>Dashboard</h1><p>${headDesc}</p></div></div>`
            + `<div class="stat-grid">${statCards}</div>`
            + `<div class="dashboard-grid"><div class="stack">${ticketsPanel}${modPanel}</div><div class="stack">${serverPanel}${botPanel}`
            + `<div class="panel"><div class="panel-header"><div><h2>Quick actions</h2><p>Jump to management pages</p></div></div><div class="panel-body"><div class="action-list">`
            + (gid
                ? `<a class="action-link" href="/dashboard/guild/${esc(gid)}/tickets">${ICONS.ticket}<span>Manage tickets<small>Review open tickets and their status</small></span></a>`
                + `<a class="action-link" href="/dashboard/guild/${esc(gid)}/moderation/cases/recent">${ICONS.shield}<span>Review moderation<small>Recent cases and actions</small></span></a>`
                + `<a class="action-link" href="/dashboard/guild/${esc(gid)}/config">${ICONS.settings}<span>Server settings<small>Prefix, channels and roles</small></span></a>`
                : `<a class="action-link" href="/auth/discord">${ICONS.shield}<span>Sign in<small>Authenticate with Discord</small></span></a>`)
            + `</div></div></div></div></div>`;

        res.send(shell({ title: "Dashboard", crumb: "Dashboard", gid, session, guildInfo, active: "dashboard", content }));
    } catch (e) {
        logger.error("dashboard", "render error", e);
        res.status(500).send(errorPage("Failed to load dashboard: " + e.message, "500"));
    }
});

expressApp.get("/dashboard/guild/:guildId/tickets", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const initialQ = String(req.query.q || "");
        const list = await tickets.getOpenTicketsSummary(req.params.guildId, 50);
        const guildInfo = getGuildInfo(req.params.guildId);
        const body = list.length === 0
            ? emptyState(ICONS.ticket, "No open tickets", "There are currently no open tickets for this server.")
            : `<div class="toolbar" role="search"><div class="search-box">${ICONS.search}<input class="input" id="ticketSearch" type="search" placeholder="Search tickets…" aria-label="Search tickets" autocomplete="off" value="${esc(initialQ)}"></div>`
            + `<select class="select" id="statusFilter" aria-label="Filter by status" style="max-width:170px"><option value="">All statuses</option><option value="OPEN">Open</option><option value="CLAIMED">Claimed</option><option value="IN_PROGRESS">In progress</option><option value="WAITING">Waiting</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select>`
            + `<select class="select" id="priorityFilter" aria-label="Filter by priority" style="max-width:170px"><option value="">All priorities</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></div>`
            + `<div class="table-wrap"><table id="ticketTable"><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Creator</th><th scope="col">Priority</th><th scope="col">Opened</th></tr></thead><tbody>`
            + list.map((t) => {
                const st = String(t.status || "OPEN").toUpperCase();
                const pr = String(t.priority || "NORMAL").toUpperCase();
                const staff = t.claimedById || t.assignedById;
                const hay = `${t.id} ${st} ${pr} ${t.openerId || ""} ${staff || ""}`.toLowerCase();
                return `<tr data-search="${esc(hay)}" data-status="${esc(st)}" data-priority="${esc(pr)}"><td class="mono">#${esc(String(t.id).slice(0, 8))}</td><td>${statusBadge(st)}</td><td><div>${esc(shortId(t.openerId))}</div><div class="sub">${staff ? "→ " + esc(shortId(staff)) : "Unassigned"}</div></td><td>${priorityBadge(pr)}</td><td>${relTime(t.createdAt)}</td></tr>`;
            }).join("")
            + `<tr id="noFilterResults" style="display:none"><td colspan="5" style="text-align:center;color:var(--text-2);padding:1.6rem">No tickets match the current filters.</td></tr>`
            + `</tbody></table></div><p class="count-note" id="ticketCount" aria-live="polite">${list.length} shown · up to 50 most recent</p>`;
        const content = `<div class="page-head"><div><h1>Tickets</h1><p>Open support tickets for this server, with live status and priority. Use search or the filters to narrow the list.</p></div></div><div class="panel"><div class="panel-header"><div><h2>Open tickets</h2><p>${list.length} shown · up to 50 most recent</p></div></div><div class="panel-body">${body}</div></div>`;
        res.send(shell({ title: "Tickets", crumb: "Tickets", gid: req.params.guildId, session, guildInfo, active: "tickets", content }));
    } catch (e) {
        logger.error("dashboard", "tickets page error", e);
        res.status(500).send(errorPage("Failed to load tickets.", "500"));
    }
});

expressApp.get("/dashboard/guild/:guildId/moderation/cases/recent", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const initialQ = String(req.query.q || "").toLowerCase();
        const list = await moderation.getRecentCasesApi(req.params.guildId, 25);
        const guildInfo = getGuildInfo(req.params.guildId);
        const body = list.length === 0
            ? emptyState(ICONS.shield, "No cases found", "Moderation cases will appear here once actions are taken.")
            : `<div class="toolbar" role="search"><div class="search-box">${ICONS.search}<input class="input" id="caseSearch" type="search" placeholder="Search cases…" aria-label="Search cases" autocomplete="off" value="${esc(req.query.q || "")}"></div></div>`
            + `<div class="table-wrap"><table id="caseTable"><thead><tr><th scope="col">Case</th><th scope="col">Target</th><th scope="col">Action</th><th scope="col">Reason</th><th scope="col">Moderator</th><th scope="col">Date</th></tr></thead><tbody>`
            + list.map((c) => {
                const hay = `${c.caseNumber} ${c.action || ""} ${c.targetTag || ""} ${c.targetId || ""} ${c.moderatorTag || ""} ${c.reason || ""}`.toLowerCase();
                const hide = initialQ && !hay.includes(initialQ) ? ' style="display:none"' : "";
                return `<tr data-search="${esc(hay)}"${hide}><td class="mono">#${esc(c.caseNumber)}</td><td>${esc(c.targetTag || c.targetId || "—")}</td><td>${esc(c.action || "—")}</td><td class="truncate" title="${esc(c.reason || "")}">${esc(c.reason || "—")}</td><td>${esc(c.moderatorTag || "—")}</td><td>${relTime(c.createdAt)}</td></tr>`;
            }).join("")
            + `</tbody></table></div><p class="count-note">${list.length} shown · up to 25 most recent</p>`;
        const content = `<div class="page-head"><div><h1>Moderation</h1><p>Recent moderation cases for this server.</p></div></div><div class="panel"><div class="panel-header"><div><h2>Cases</h2><p>Newest first</p></div></div><div class="panel-body">${body}</div></div>`;
        res.send(shell({ title: "Moderation", crumb: "Moderation", gid: req.params.guildId, session, guildInfo, active: "moderation", content }));
    } catch (e) {
        logger.error("dashboard", "moderation page error", e);
        res.status(500).send(errorPage("Failed to load moderation cases.", "500"));
    }
});

expressApp.get("/dashboard/guild/:guildId/logs/mod", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const list = await logging.getModLogHistory(req.params.guildId, 50);
        const guildInfo = getGuildInfo(req.params.guildId);
        const body = list.length === 0
            ? emptyState(ICONS.log, "No log entries", "Audit log entries for moderation will appear here.")
            : `<div class="table-wrap"><table><thead><tr><th scope="col">Time</th><th scope="col">Category</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead><tbody>`
            + list.map((h) => `<tr><td>${relTime(h.createdAt)}</td><td>${esc(h.category || "—")}</td><td>${esc(h.action || "—")}</td><td class="mono">${esc(shortId(h.actorId) || "—")}</td><td class="mono">${esc(shortId(h.targetId) || "—")}</td><td class="truncate" title="${esc(h.details || "")}">${esc(h.details || "—")}</td></tr>`).join("")
            + `</tbody></table></div><p class="count-note">${list.length} shown · up to 50 most recent</p>`;
        const content = `<div class="page-head"><div><h1>Mod Log</h1><p>Audit trail of moderation-related activity for this server.</p></div></div><div class="panel"><div class="panel-header"><div><h2>Entries</h2><p>Newest first</p></div></div><div class="panel-body">${body}</div></div>`;
        res.send(shell({ title: "Mod Log", crumb: "Mod Log", gid: req.params.guildId, session, guildInfo, active: "logs", content }));
    } catch (e) {
        logger.error("dashboard", "mod log page error", e);
        res.status(500).send(errorPage("Failed to load mod log.", "500"));
    }
});

expressApp.get("/dashboard/guild/:guildId/config", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const c = await settings.get(req.params.guildId).catch(() => null);
        const guildInfo = getGuildInfo(req.params.guildId);
        const val = (v) => esc(v ?? "");
        const arr = (v) => esc(Array.isArray(v) ? v.join(", ") : "");
        const pretty = (v) => {
            try { return esc(typeof v === "string" ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v, null, 2)); }
            catch { return esc(String(v ?? "")); }
        };
        let moduleToggles = "";
        if (c) {
            try {
                const mods = typeof c.modules === "string" ? JSON.parse(c.modules || "{}") : (c.modules || {});
                const keys = Object.keys(mods);
                if (keys.length > 0) {
                    moduleToggles = `<div class="panel" style="margin-bottom:1rem"><div class="panel-header"><div><h2>Modules</h2><p>Toggle bot modules for this server.</p></div></div><div class="panel-body">`
                        + keys.map((k) => `<div class="switch-row"><div class="t"><strong>${esc(k)}</strong><small>module.${esc(k)}</small></div><label class="switch"><input type="checkbox" data-module="${esc(k)}"${mods[k] ? " checked" : ""} aria-label="Toggle ${esc(k)}"><span class="track" aria-hidden="true"></span></label></div>`).join("")
                        + `</div></div>`;
                }
            } catch { moduleToggles = ""; }
        }
        const body = !c
            ? emptyState(ICONS.settings, "No configuration found", "Configuration will be created automatically once the bot sees this server.")
            : `<form id="settingsForm" action="/api/guild/${esc(req.params.guildId)}/config" method="POST" novalidate>`
            + `<div class="panel" style="margin-bottom:1rem"><div class="panel-header"><div><h2>General</h2><p>Basic bot behaviour for this server.</p></div></div><div class="panel-body">`
            + `<div class="field"><label for="f-prefix">Command prefix</label><small class="hint">Prefix the bot listens for, e.g. !</small><input class="input" id="f-prefix" name="prefix" type="text" maxlength="3" value="${val(c.prefix || "!")}" autocomplete="off" style="max-width:120px"></div>`
            + `</div></div>`
            + `<div class="panel" style="margin-bottom:1rem"><div class="panel-header"><div><h2>Channels</h2><p>Channel IDs used for logging, welcomes and tickets. Leave blank to disable.</p></div></div><div class="panel-body"><div class="form-grid">`
            + [["logChannelId", "Log channel", "General event log"], ["modLogChannelId", "Mod log channel", "Moderation actions"], ["welcomeChannelId", "Welcome channel", "New member greetings"], ["goodbyeChannelId", "Goodbye channel", "Member farewells"], ["ticketCategoryId", "Ticket category", "Category for ticket channels"], ["ticketLogChannelId", "Ticket log channel", "Ticket transcripts and events"]].map(([k, lb, hint]) => `<div class="field"><label for="f-${k}">${lb}</label><small class="hint">${hint}</small><input class="input" id="f-${k}" name="${k}" type="text" inputmode="numeric" placeholder="Channel ID" value="${val(c[k])}" autocomplete="off"></div>`).join("")
            + `</div></div></div>`
            + `<div class="panel" style="margin-bottom:1rem"><div class="panel-header"><div><h2>Roles</h2><p>Comma-separated role IDs. Staff can manage tickets; moderators get extra permissions.</p></div></div><div class="panel-body"><div class="form-grid">`
            + `<div class="field"><label for="f-staff">Staff role IDs</label><small class="hint">e.g. 123…, 456…</small><input class="input" id="f-staff" name="staffRoleIds" type="text" placeholder="123…, 456…" value="${arr(c.staffRoleIds)}" autocomplete="off"></div>`
            + `<div class="field"><label for="f-mod">Moderator role IDs</label><small class="hint">e.g. 123…, 456…</small><input class="input" id="f-mod" name="moderatorRoleIds" type="text" placeholder="123…, 456…" value="${arr(c.moderatorRoleIds)}" autocomplete="off"></div>`
            + `</div></div></div>`
            + moduleToggles
            + `<div class="panel" style="margin-bottom:1rem"><div class="panel-header"><div><h2>Advanced</h2><p>Read-only state. These are managed by bot commands.</p></div></div><div class="panel-body">`
            + `<div class="field"><span class="lbl" id="adv-modules">Modules (raw)</span><pre class="codeblock" aria-labelledby="adv-modules">${pretty(c.modules)}</pre></div>`
            + `<div class="field"><span class="lbl" id="adv-automod">Automod</span><pre class="codeblock" aria-labelledby="adv-automod">${pretty(c.automod)}</pre></div>`
            + `<div class="field"><span class="lbl" id="adv-orders">Orders</span><pre class="codeblock" aria-labelledby="adv-orders">${pretty(c.orders)}</pre></div>`
            + `</div></div>`
            + `<div class="savebar"><button class="btn btn-primary" id="saveSettings" type="submit">Save changes</button><button class="btn btn-secondary" id="resetSettings" type="button" data-confirm="Discard all unsaved changes and restore the last saved values?" data-confirm-title="Discard changes?" data-confirm-action="reset-form" data-form="settingsForm">Reset</button><span class="form-status" id="formStatus" aria-live="polite"></span></div></form>`;
        const content = `<div class="page-head"><div><h1>Server Settings</h1><p>Configure how .pulse behaves in this server. Changes save immediately.</p></div></div>${body}`;
        res.send(shell({ title: "Server Settings", crumb: "Server Settings", gid: req.params.guildId, session, guildInfo, active: "settings", content }));
    } catch (e) {
        logger.error("dashboard", "settings page error", e);
        res.status(500).send(errorPage("Failed to load settings.", "500"));
    }
});

// ── 404 handler ─────────────────────────────────────────
expressApp.use((req, res) => {
    if (isApiRoute(req)) return res.status(404).json({ error: "Not found." });
    res.status(404).send(errorPage("The page you are looking for does not exist. Check the address or return to the dashboard.", "404"));
});

// ── Global error handler ────────────────────────────────
expressApp.use(errorHandler);

// ── Export and server lifecycle ─────────────────────────
export default expressApp;

export async function startServer() {
    try { await prisma.$connect(); logger.info("db", "Dashboard Prisma connected."); } catch (e) { logger.error("db", "Dashboard Prisma connection failed", e); throw e; }
    return new Promise((resolve, reject) => {
        const server = expressApp.listen(process.env.DASHBOARD_PORT || 9875, "0.0.0.0", () => { logger.info("dashboard", ".pulse dashboard listening on 0.0.0.0:" + (process.env.DASHBOARD_PORT || 9875)); resolve(); });
        server.on("error", reject);
    });
}
