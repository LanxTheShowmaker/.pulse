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
};

function getStyles() {
    return [
        ":root{",
        "--bg:#0b0d12;--surface:#11141b;--surface-2:#171b23;--surface-3:#1e2330;",
        "--border:rgba(255,255,255,.07);--border-strong:rgba(255,255,255,.12);",
        "--text:#f1f3f5;--text-2:#9aa1ad;--text-3:#6f7785;",
        "--accent:#5865f2;--accent-hover:#4752c4;--accent-soft:rgba(88,101,242,.14);",
        "--success:#3ba55d;--success-soft:rgba(59,165,93,.14);--warning:#faa81a;--warning-soft:rgba(250,168,26,.13);",
        "--danger:#ed4245;--danger-soft:rgba(237,66,69,.13);--info:#5b8cff;--info-soft:rgba(91,140,255,.13);",
        "--radius:10px;--radius-sm:7px;",
        "--shadow:0 1px 2px rgba(0,0,0,.35);",
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
        ".app{display:flex;min-height:100vh}",
        /* sidebar */
        ".sidebar{width:240px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;z-index:40;display:flex;flex-direction:column;transition:transform .18s ease,width .18s ease}",
        ".brand{display:flex;align-items:center;gap:.65rem;padding:1.1rem 1.25rem;border-bottom:1px solid var(--border)}",
        ".brand-mark{width:32px;height:32px;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0}",
        ".brand-text{min-width:0}",
        ".brand-text strong{display:block;font-size:.95rem;letter-spacing:.01em}",
        ".brand-text span{display:block;font-size:.72rem;color:var(--text-3)}",
        ".side-nav{flex:1;overflow-y:auto;padding:.9rem .7rem}",
        ".nav-group{font-size:.68rem;font-weight:600;letter-spacing:.09em;color:var(--text-3);padding:.85rem .6rem .35rem;text-transform:uppercase}",
        ".nav-link{display:flex;align-items:center;gap:.7rem;padding:.55rem .6rem;border-radius:var(--radius-sm);color:var(--text-2);font-size:.9rem;font-weight:500;position:relative;margin-bottom:1px}",
        ".nav-link:hover{background:var(--surface-2);color:var(--text);text-decoration:none}",
        ".nav-link svg{width:17px;height:17px;flex-shrink:0}",
        ".nav-link.active{background:var(--accent-soft);color:var(--text)}",
        ".nav-link.active::before{content:'';position:absolute;left:-.7rem;top:.45rem;bottom:.45rem;width:3px;border-radius:3px;background:var(--accent)}",
        ".nav-link.active svg{color:var(--accent)}",
        ".side-foot{border-top:1px solid var(--border);padding:.9rem 1rem}",
        ".user-chip{display:flex;align-items:center;gap:.65rem;min-width:0}",
        ".user-chip .avatar{width:32px;height:32px;border-radius:50%;background:var(--surface-3);border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:var(--text-2);flex-shrink:0}",
        ".user-chip .who{min-width:0;flex:1}",
        ".user-chip .who strong{display:block;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".user-chip .who span{display:block;font-size:.72rem;color:var(--text-3)}",
        ".icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--text-2);cursor:pointer}",
        ".icon-btn:hover{background:var(--surface-2);color:var(--text)}",
        ".icon-btn svg{width:18px;height:18px}",
        /* main + topbar */
        ".main{flex:1;min-width:0;margin-left:240px;display:flex;flex-direction:column;transition:margin .18s ease}",
        "body.collapsed .main{margin-left:72px}",
        "body.collapsed .sidebar{width:72px}",
        "body.collapsed .brand-text,body.collapsed .nav-group,body.collapsed .nav-link span,body.collapsed .side-foot .who,body.collapsed .side-foot .logout-text{display:none}",
        "body.collapsed .nav-link{justify-content:center;padding:.6rem}",
        "body.collapsed .brand{justify-content:center;padding:1.1rem .5rem}",
        "body.collapsed .user-chip{justify-content:center}",
        ".topbar{position:sticky;top:0;z-index:30;background:rgba(11,13,18,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:.7rem 1.75rem;display:flex;align-items:center;gap:.9rem}",
        ".crumb{font-size:.9rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".crumb strong{color:var(--text);font-weight:600}",
        ".topbar .spacer{flex:1}",
        ".guild-pill{display:inline-flex;align-items:center;gap:.45rem;font-size:.8rem;color:var(--text-2);background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:.32rem .8rem;white-space:nowrap}",
        ".guild-pill .dot{width:7px;height:7px;border-radius:50%;background:var(--success);flex-shrink:0}",
        ".guild-pill code{font-family:var(--mono);font-size:.76rem;color:var(--text)}",
        ".logout-form{display:inline}",
        /* content */
        ".content{width:100%;max-width:1200px;margin:0 auto;padding:1.75rem}",
        ".page-head{margin-bottom:1.4rem}",
        ".page-head h1{font-size:1.45rem;font-weight:650;letter-spacing:-.01em}",
        ".page-head p{color:var(--text-2);font-size:.9rem;margin-top:.25rem;max-width:70ch}",
        ".section-title{font-size:.95rem;font-weight:650;margin:0 0 .8rem}",
        ".section-sub{font-size:.83rem;color:var(--text-2);margin:-.5rem 0 .9rem}",
        /* grids + cards */
        ".stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.9rem;margin-bottom:1.1rem}",
        ".panel-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:.9rem;margin-bottom:1.1rem;align-items:start}",
        ".panel-grid.equal{grid-template-columns:1fr 1fr}",
        ".card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:1.15rem 1.25rem;min-width:0}",
        ".stat-card{display:flex;gap:.9rem;align-items:flex-start}",
        ".stat-card .ic{width:36px;height:36px;border-radius:9px;background:var(--surface-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0}",
        ".stat-card .ic svg{width:18px;height:18px}",
        ".stat-card .lb{font-size:.74rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3)}",
        ".stat-card .vl{font-size:1.6rem;font-weight:700;letter-spacing:-.02em;line-height:1.25;font-variant-numeric:tabular-nums}",
        ".stat-card .sb{font-size:.78rem;color:var(--text-2)}",
        ".card-head{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-bottom:.9rem}",
        ".card-head h2{font-size:.95rem;font-weight:650}",
        ".card-head a.more{font-size:.8rem;white-space:nowrap}",
        ".kv{display:flex;justify-content:space-between;gap:1rem;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:.86rem}",
        ".kv:last-child{border-bottom:0}",
        ".kv dt{color:var(--text-2)}",
        ".kv dd{font-family:var(--mono);font-size:.8rem;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%}",
        ".kv dd.plain{font-family:var(--font)}",
        /* tables */
        ".table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}",
        "table{width:100%;border-collapse:collapse;font-size:.86rem;min-width:560px}",
        "th,td{padding:.62rem .9rem;text-align:left;border-bottom:1px solid var(--border);vertical-align:middle}",
        "tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}",
        "thead th{background:var(--surface-2);color:var(--text-3);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}",
        "tbody tr{transition:background .12s ease}",
        "tbody tr:hover{background:var(--surface-2)}",
        "td.mono{font-family:var(--mono);font-size:.79rem}",
        ".truncate{max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
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
        /* feeds */
        ".feed{list-style:none;display:flex;flex-direction:column}",
        ".feed li{display:flex;gap:.75rem;padding:.7rem 0;border-bottom:1px solid var(--border);font-size:.86rem}",
        ".feed li:last-child{border-bottom:0}",
        ".feed .fi{width:30px;height:30px;border-radius:8px;background:var(--surface-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-2);flex-shrink:0;font-size:.7rem;font-weight:700}",
        ".feed .fb{min-width:0}",
        ".feed .fb strong{font-weight:600}",
        ".feed .fm{font-size:.76rem;color:var(--text-3);margin-top:.1rem}",
        /* actions */
        ".action-list{display:flex;flex-direction:column;gap:.55rem}",
        ".action-link{display:flex;align-items:center;gap:.7rem;padding:.65rem .8rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text);font-size:.87rem;font-weight:550}",
        ".action-link:hover{border-color:var(--border-strong);text-decoration:none;background:var(--surface-3)}",
        ".action-link svg{width:16px;height:16px;color:var(--accent)}",
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
        ".btn[disabled]{opacity:.6;cursor:wait}",
        ".btn.is-loading{pointer-events:none;opacity:.7}",
        ".field{margin-bottom:1rem}",
        ".field label{display:block;font-size:.83rem;font-weight:600;margin-bottom:.3rem}",
        ".field .hint{font-size:.76rem;color:var(--text-3);margin-bottom:.4rem}",
        ".input,.select,textarea.input{width:100%;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:8px;color:var(--text);font-size:.87rem;font-family:var(--font);padding:.55rem .7rem}",
        ".input:focus,.select:focus,textarea.input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}",
        ".input::placeholder{color:var(--text-3)}",
        "textarea.input{font-family:var(--mono);font-size:.78rem;resize:vertical}",
        ".form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem}",
        ".savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:.8rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:.8rem 1rem;margin-top:1.1rem}",
        ".form-status{font-size:.83rem;color:var(--text-2)}",
        ".form-status.ok{color:#6fd598}",
        ".form-status.err{color:#ff8a8d}",
        ".toolbar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:.9rem}",
        ".toolbar .grow{flex:1;min-width:180px}",
        ".search-box{position:relative;flex:1;min-width:200px;max-width:340px}",
        ".search-box svg{position:absolute;left:.65rem;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--text-3);pointer-events:none}",
        ".search-box .input{padding-left:2.1rem}",
        ".count-note{font-size:.8rem;color:var(--text-3);margin-top:.7rem}",
        /* states */
        ".empty{border:1px dashed var(--border-strong);border-radius:var(--radius);padding:2.2rem 1.5rem;text-align:center;background:var(--surface)}",
        ".empty .ei{width:40px;height:40px;border-radius:11px;background:var(--surface-3);display:inline-flex;align-items:center;justify-content:center;color:var(--text-3);margin-bottom:.7rem}",
        ".empty .ei svg{width:20px;height:20px}",
        ".empty h3{font-size:.95rem;margin-bottom:.3rem}",
        ".empty p{font-size:.83rem;color:var(--text-2);max-width:46ch;margin:0 auto}",
        ".center-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}",
        ".center-card{max-width:430px;width:100%;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:2.4rem 2rem}",
        ".center-card .code{font-size:3rem;font-weight:750;letter-spacing:-.03em}",
        ".center-card h1{font-size:1.2rem;margin:.4rem 0 .5rem}",
        ".center-card p{color:var(--text-2);font-size:.88rem;margin-bottom:1.4rem}",
        ".brand-row{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-bottom:1.2rem}",
        /* toasts */
        "#toasts{position:fixed;right:1rem;bottom:1rem;z-index:90;display:flex;flex-direction:column;gap:.55rem;max-width:min(360px,calc(100vw - 2rem))}",
        ".toast{display:flex;gap:.6rem;align-items:flex-start;background:var(--surface-3);border:1px solid var(--border-strong);border-radius:10px;padding:.7rem .9rem;font-size:.84rem;box-shadow:0 8px 24px rgba(0,0,0,.45);animation:tin .18s ease}",
        ".toast.ok{border-color:rgba(59,165,93,.5)}",
        ".toast.err{border-color:rgba(237,66,69,.5)}",
        "@keyframes tin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
        ".overlay{display:none}",
        "#navToggle{display:none}",
        "#collapseToggle{display:inline-flex}",
        "code.mono{font-family:var(--mono);font-size:.8rem;background:var(--surface-3);border:1px solid var(--border);border-radius:6px;padding:.1rem .4rem}",
        "pre.codeblock{font-family:var(--mono);font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:.8rem;overflow-x:auto;color:var(--text-2);max-height:220px;overflow-y:auto}",
        /* responsive */
        "@media (max-width:1100px){.stat-grid{grid-template-columns:repeat(2,1fr)}.panel-grid,.panel-grid.equal{grid-template-columns:1fr}}",
        "@media (max-width:1024px){",
        ".sidebar{transform:translateX(-100%);width:250px}",
        "body.collapsed .sidebar{width:250px}",
        "body.collapsed .brand-text,body.collapsed .nav-group,body.collapsed .nav-link span,body.collapsed .side-foot .who{display:block}",
        "body.collapsed .nav-link{justify-content:flex-start}",
        ".sidebar.open{transform:none;box-shadow:0 0 60px rgba(0,0,0,.6)}",
        ".main,body.collapsed .main{margin-left:0}",
        "#navToggle{display:inline-flex}",
        "#collapseToggle{display:none}",
        ".overlay.show{display:block;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:35}",
        "}",
        "@media (max-width:640px){.content{padding:1.1rem}.stat-grid{grid-template-columns:1fr 1fr;gap:.7rem}.stat-card .vl{font-size:1.3rem}.form-grid{grid-template-columns:1fr}.topbar{padding:.7rem 1rem}.guild-pill .gid-full{display:none}.page-head h1{font-size:1.2rem}}",
        "@media (max-width:420px){.stat-grid{grid-template-columns:1fr}}",
        "@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}",
    ].join("");
}

function navItem(href, icon, label, active) {
    return `<a class="nav-link${active ? " active" : ""}" href="${esc(href)}"${active ? ' aria-current="page"' : ""}>${icon}<span>${esc(label)}</span></a>`;
}

function shell(opts) {
    const userShort = shortId(opts.session.userId);
    const userInitial = esc(String(opts.session.userId || "?").slice(0, 2).toUpperCase());
    const gid = opts.gid || null;
    const g = (p) => gid ? "/dashboard/guild/" + gid + p : "/dashboard";
    const nav = [
        `<p class="nav-group">Overview</p>`,
        navItem("/dashboard", ICONS.dashboard, "Dashboard", opts.active === "dashboard"),
        `<p class="nav-group">Management</p>`,
        navItem(g("tickets"), ICONS.ticket, "Tickets", opts.active === "tickets"),
        navItem(g("moderation/cases/recent"), ICONS.shield, "Moderation", opts.active === "moderation"),
        navItem(g("logs/mod"), ICONS.log, "Mod Log", opts.active === "logs"),
        `<p class="nav-group">Configuration</p>`,
        navItem(g("config"), ICONS.settings, "Server Settings", opts.active === "settings"),
    ].join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(opts.title)} — .pulse</title><style>${getStyles()}</style></head><body>`
        + `<a class="skip-link" href="#main">Skip to content</a>`
        + `<div class="app">`
        + `<aside class="sidebar" id="sidebar" aria-label="Primary"><div class="brand"><div class="brand-mark" aria-hidden="true">p</div><div class="brand-text"><strong>.pulse</strong><span>Control Panel</span></div></div>`
        + `<nav class="side-nav" aria-label="Dashboard sections">${nav}</nav>`
        + `<div class="side-foot"><div class="user-chip"><div class="avatar" aria-hidden="true">${userInitial}</div><div class="who"><strong>User ${esc(userShort)}</strong><span>Discord account</span></div></div></div></aside>`
        + `<div class="overlay" id="overlay"></div>`
        + `<div class="main"><header class="topbar">`
        + `<button class="icon-btn" id="navToggle" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${ICONS.menu}</button>`
        + `<button class="icon-btn" id="collapseToggle" aria-label="Collapse sidebar">${ICONS.collapse}</button>`
        + `<nav class="crumb" aria-label="Breadcrumb">Pulse <span aria-hidden="true">/</span> <strong>${esc(opts.crumb)}</strong></nav>`
        + `<div class="spacer"></div>`
        + (gid
            ? `<span class="guild-pill" title="Guild ID ${esc(gid)}"><span class="dot" aria-hidden="true"></span>Server <code class="gid-full">${esc(gid)}</code><code>${esc(shortId(gid))}</code></span>`
            : `<span class="guild-pill"><span class="dot" aria-hidden="true"></span>No server selected</span>`)
        + `<form class="logout-form" action="/auth/logout" method="POST"><button type="submit" class="btn btn-secondary btn-sm" aria-label="Log out">${ICONS.logout}<span class="logout-text">Log out</span></button></form>`
        + `</header><main class="content" id="main" tabindex="-1">${opts.content}</main></div></div>`
        + `<div id="toasts" role="status" aria-live="polite"></div>`
        + `<script>${clientScript()}<\/script></body></html>`;
}

function clientScript() {
    return [
        "(function(){",
        "var sidebar=document.getElementById('sidebar'),overlay=document.getElementById('overlay'),navToggle=document.getElementById('navToggle');",
        "function closeDrawer(){if(!sidebar)return;sidebar.classList.remove('open');if(overlay)overlay.classList.remove('show');if(navToggle)navToggle.setAttribute('aria-expanded','false');}",
        "if(navToggle&&sidebar){navToggle.addEventListener('click',function(){var open=sidebar.classList.toggle('open');if(overlay)overlay.classList.toggle('show',open);navToggle.setAttribute('aria-expanded',open?'true':'false');});}",
        "if(overlay)overlay.addEventListener('click',closeDrawer);",
        "document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrawer();});",
        "var collapse=document.getElementById('collapseToggle');",
        "try{if(localStorage.getItem('pulse:collapsed')==='1')document.body.classList.add('collapsed');}catch(e){}",
        "if(collapse)collapse.addEventListener('click',function(){document.body.classList.toggle('collapsed');try{localStorage.setItem('pulse:collapsed',document.body.classList.contains('collapsed')?'1':'0');}catch(e){}});",
        "window.toast=function(msg,type){var box=document.getElementById('toasts');if(!box)return;var el=document.createElement('div');el.className='toast '+(type||'');el.textContent=msg;box.appendChild(el);setTimeout(function(){el.remove();},4200);};",
        // relative timestamps (progressive enhancement; server renders absolute text)
        "function rel(d){var s=Math.floor((Date.now()-d.getTime())/1000);if(s<0)s=0;if(s<60)return s+'s ago';var m=Math.floor(s/60);if(m<60)return m+'m ago';var h=Math.floor(m/60);if(h<24)return h+'h ago';var days=Math.floor(h/24);if(days<30)return days+'d ago';return d.toLocaleDateString();}",
        "try{document.querySelectorAll('time[data-rel]').forEach(function(t){var d=new Date(t.getAttribute('datetime'));if(!isNaN(d))t.textContent=rel(d);});}catch(e){}",
        // tickets filter
        "var q=document.getElementById('ticketSearch'),sf=document.getElementById('statusFilter'),pf=document.getElementById('priorityFilter');",
        "if(q||sf||pf){var rows=Array.prototype.slice.call(document.querySelectorAll('#ticketTable tbody tr[data-search]'));var count=document.getElementById('ticketCount');var empty=document.getElementById('noFilterResults');",
        "function apply(){var needle=(q&&q.value||'').trim().toLowerCase(),st=sf?sf.value:'',pr=pf?pf.value:'';var n=0;",
        "rows.forEach(function(r){var ok=(!needle||r.getAttribute('data-search').indexOf(needle)>-1)&&(!st||r.getAttribute('data-status')===st)&&(!pr||r.getAttribute('data-priority')===pr);r.style.display=ok?'':'none';if(ok)n++;});",
        "if(count)count.textContent=n+' shown';if(empty)empty.style.display=n===0?'':'none';}",
        "if(q)q.addEventListener('input',apply);if(sf)sf.addEventListener('change',apply);if(pf)pf.addEventListener('change',apply);apply();}",
        // settings form
        "var form=document.getElementById('settingsForm');",
        "if(form){form.addEventListener('submit',function(e){e.preventDefault();var btn=document.getElementById('saveSettings'),status=document.getElementById('formStatus');",
        "if(btn){btn.disabled=true;btn.classList.add('is-loading');}",
        "if(status){status.className='form-status';status.textContent='Saving…';}",
        "var fd=new FormData(form);function str(k){var v=(fd.get(k)||'').toString().trim();return v==='' ? null : v;}",
        "function idList(k){var v=(fd.get(k)||'').toString().split(',').map(function(s){return s.trim();}).filter(Boolean);return JSON.stringify(v);}",
        "var payload={prefix:str('prefix')||'!',logChannelId:str('logChannelId'),modLogChannelId:str('modLogChannelId'),welcomeChannelId:str('welcomeChannelId'),goodbyeChannelId:str('goodbyeChannelId'),ticketCategoryId:str('ticketCategoryId'),ticketLogChannelId:str('ticketLogChannelId'),staffRoleIds:idList('staffRoleIds'),moderatorRoleIds:idList('moderatorRoleIds')};",
        "fetch(form.action,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'}).then(function(r){return r.json().then(function(j){return {ok:r.ok,body:j};});}).then(function(out){",
        "if(btn){btn.disabled=false;btn.classList.remove('is-loading');}",
        "if(out.ok){if(status){status.className='form-status ok';status.textContent='Saved.';}window.toast('Settings saved.','ok');}",
        "else{if(status){status.className='form-status err';status.textContent=(out.body&&out.body.error)||'Save failed.';}window.toast((out.body&&out.body.error)||'Save failed.','err');}",
        "}).catch(function(err){if(btn){btn.disabled=false;btn.classList.remove('is-loading');}if(status){status.className='form-status err';status.textContent='Network error.';}window.toast('Network error while saving.','err');});});",
        "var reset=document.getElementById('resetSettings');if(reset)reset.addEventListener('click',function(){form.reset();var s=document.getElementById('formStatus');if(s){s.className='form-status';s.textContent='';}});}",
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

function emptyState(icon, title, text) {
    return `<div class="empty"><div class="ei">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
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
        const config = gid ? await settings.get(gid).catch(() => null) : null;
        const openTickets = gid ? await tickets.getOpenTicketsSummary(gid, 10).catch(() => []) : [];
        const recentCases = gid ? await moderation.getRecentCasesApi(gid, 5).catch(() => []) : [];
        const stats = gid ? await tickets.getStats(gid).catch(() => ({ open: 0, closed: 0, total: 0, avgRating: null, ratedCount: 0 })) : { open: 0, closed: 0, total: 0, avgRating: null, ratedCount: 0 };

        const rating = stats.avgRating != null ? Number(stats.avgRating).toFixed(1) : "—";
        const ratingSub = stats.ratedCount ? `from ${stats.ratedCount} rating${stats.ratedCount === 1 ? "" : "s"}` : "no ratings yet";
        const channelFields = ["logChannelId", "modLogChannelId", "welcomeChannelId", "goodbyeChannelId", "ticketCategoryId", "ticketLogChannelId"];
        const channelsSet = config ? channelFields.filter((k) => config[k]).length : 0;
        const staffCount = config && Array.isArray(config.staffRoleIds) ? config.staffRoleIds.length : 0;
        const modCount = config && Array.isArray(config.moderatorRoleIds) ? config.moderatorRoleIds.length : 0;

        const statCards = [
            { label: "Open tickets", value: String(stats.open ?? 0), sub: "needs attention", icon: ICONS.ticket },
            { label: "Closed tickets", value: String(stats.closed ?? 0), sub: `${stats.total ?? (stats.open ?? 0) + (stats.closed ?? 0)} total`, icon: ICONS.check },
            { label: "Recent cases", value: String(recentCases.length), sub: "latest moderation activity", icon: ICONS.shield },
            { label: "Avg. rating", value: rating, sub: ratingSub, icon: ICONS.clock },
        ].map((c) => `<div class="card stat-card"><div class="ic" aria-hidden="true">${c.icon}</div><div><div class="lb">${esc(c.label)}</div><div class="vl">${esc(c.value)}</div><div class="sb">${esc(c.sub)}</div></div></div>`).join("");

        const ticketRows = openTickets.map((t) => `<tr><td class="mono">#${esc(String(t.id).slice(0, 8))}</td><td>${statusBadge(t.status)}</td><td>${priorityBadge(t.priority)}</td><td>${relTime(t.createdAt)}</td></tr>`).join("");
        const ticketsPanel = openTickets.length === 0
            ? emptyState(ICONS.ticket, "No open tickets", "New support tickets will appear here as soon as members open them.")
            : `<div class="table-wrap"><table><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Priority</th><th scope="col">Opened</th></tr></thead><tbody>${ticketRows}</tbody></table></div>`;

        const caseFeed = recentCases.length === 0
            ? emptyState(ICONS.shield, "No moderation actions yet", "Cases will appear here once moderators take action.")
            : `<ul class="feed">${recentCases.map((c) => `<li><div class="fi" aria-hidden="true">#${esc(String(c.caseNumber))}</div><div class="fb"><strong>${esc(c.action || "Action")}</strong> — ${esc(c.targetTag || c.targetId || "unknown")}<div class="fm">by ${esc(c.moderatorTag || "unknown")} · ${relTime(c.createdAt)}${c.reason ? ` · ${esc(String(c.reason).slice(0, 90))}` : ""}</div></div></li>`).join("")}</ul>`;

        const statusPanel = !gid
            ? emptyState(ICONS.alert, "No server selected", "Your session is not linked to a server yet.")
            : !config
                ? emptyState(ICONS.alert, "No configuration yet", "Server configuration will appear here once the bot sees this server.")
                : `<dl>${[
                    ["Server ID", `<code class="mono">${esc(gid)}</code>`, false],
                    ["Command prefix", `<code class="mono">${esc(config.prefix || "!")}</code>`, false],
                    ["Channels configured", `${channelsSet} of 6`, true],
                    ["Staff roles", `${staffCount}`, true],
                    ["Moderator roles", `${modCount}`, true],
                ].map(([k, v, plain]) => `<div class="kv"><dt>${esc(k)}</dt><dd class="${plain ? "plain" : ""}">${v}</dd></div>`).join("")}</dl>`;

        const content = `<div class="page-head"><h1>Dashboard</h1><p>${gid ? `Overview for server <code class="mono">${esc(shortId(gid))}</code>. Live data from .pulse.` : "Sign in to see your server overview."}</p></div>`
            + `<div class="stat-grid">${statCards}</div>`
            + `<div class="panel-grid"><section class="card" aria-labelledby="h-recent-tickets"><div class="card-head"><h2 id="h-recent-tickets">Recent tickets</h2>${gid ? `<a class="more" href="/dashboard/guild/${esc(gid)}/tickets">View all</a>` : ""}</div>${ticketsPanel}</section>`
            + `<section class="card" aria-labelledby="h-server-status"><div class="card-head"><h2 id="h-server-status">Server status</h2></div>${statusPanel}</section></div>`
            + `<div class="panel-grid equal"><section class="card" aria-labelledby="h-recent-mod"><div class="card-head"><h2 id="h-recent-mod">Recent moderation</h2>${gid ? `<a class="more" href="/dashboard/guild/${esc(gid)}/moderation/cases/recent">View all</a>` : ""}</div>${caseFeed}</section>`
            + `<section class="card" aria-labelledby="h-quick"><div class="card-head"><h2 id="h-quick">Quick actions</h2></div><div class="action-list">`
            + (gid
                ? `<a class="action-link" href="/dashboard/guild/${esc(gid)}/tickets">${ICONS.ticket}<span>Manage tickets<small>Review open tickets and their status</small></span></a>`
                + `<a class="action-link" href="/dashboard/guild/${esc(gid)}/moderation/cases/recent">${ICONS.shield}<span>Review moderation<small>Recent cases and actions</small></span></a>`
                + `<a class="action-link" href="/dashboard/guild/${esc(gid)}/config">${ICONS.settings}<span>Server settings<small>Prefix, channels and roles</small></span></a>`
                : `<a class="action-link" href="/auth/discord">${ICONS.shield}<span>Sign in<small>Authenticate with Discord</small></span></a>`)
            + `</div></section></div>`;

        res.send(shell({ title: "Dashboard", crumb: "Dashboard", gid, session, active: "dashboard", content }));
    } catch (e) {
        logger.error("dashboard", "render error", e);
        res.status(500).send(errorPage("Failed to load dashboard: " + e.message, "500"));
    }
});

expressApp.get("/dashboard/guild/:guildId/tickets", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const list = await tickets.getOpenTicketsSummary(req.params.guildId, 50);
        const body = list.length === 0
            ? emptyState(ICONS.ticket, "No open tickets", "There are currently no open tickets for this server.")
            : `<div class="toolbar" role="search"><div class="search-box">${ICONS.search}<input class="input" id="ticketSearch" type="search" placeholder="Search tickets…" aria-label="Search tickets" autocomplete="off"></div>`
            + `<select class="select" id="statusFilter" aria-label="Filter by status" style="max-width:170px"><option value="">All statuses</option><option value="OPEN">Open</option><option value="CLAIMED">Claimed</option><option value="IN_PROGRESS">In progress</option><option value="WAITING">Waiting</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select>`
            + `<select class="select" id="priorityFilter" aria-label="Filter by priority" style="max-width:170px"><option value="">All priorities</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></div>`
            + `<div class="table-wrap"><table id="ticketTable"><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Priority</th><th scope="col">Opened</th></tr></thead><tbody>`
            + list.map((t) => {
                const st = String(t.status || "OPEN").toUpperCase();
                const pr = String(t.priority || "NORMAL").toUpperCase();
                const hay = `${t.id} ${st} ${pr}`.toLowerCase();
                return `<tr data-search="${esc(hay)}" data-status="${esc(st)}" data-priority="${esc(pr)}"><td class="mono">#${esc(String(t.id).slice(0, 8))}</td><td>${statusBadge(st)}</td><td>${priorityBadge(pr)}</td><td>${relTime(t.createdAt)}</td></tr>`;
            }).join("")
            + `<tr id="noFilterResults" style="display:none"><td colspan="4" style="text-align:center;color:var(--text-2);padding:1.6rem">No tickets match the current filters.</td></tr>`
            + `</tbody></table></div><p class="count-note" id="ticketCount" aria-live="polite">${list.length} shown · up to 50 most recent</p>`;
        const content = `<div class="page-head"><h1>Tickets</h1><p>Open support tickets for this server, with live status and priority.</p></div><section class="card" aria-label="Ticket list">${body}</section>`;
        res.send(shell({ title: "Tickets", crumb: "Tickets", gid: req.params.guildId, session, active: "tickets", content }));
    } catch (e) {
        logger.error("dashboard", "tickets page error", e);
        res.status(500).send(errorPage("Failed to load tickets.", "500"));
    }
});

expressApp.get("/dashboard/guild/:guildId/moderation/cases/recent", async (req, res) => {
    try {
        const session = req.session;
        if (!session) return res.redirect("/auth/discord");
        const list = await moderation.getRecentCasesApi(req.params.guildId, 25);
        const body = list.length === 0
            ? emptyState(ICONS.shield, "No cases found", "Moderation cases will appear here once actions are taken.")
            : `<div class="table-wrap"><table><thead><tr><th scope="col">Case</th><th scope="col">Target</th><th scope="col">Action</th><th scope="col">Reason</th><th scope="col">Moderator</th><th scope="col">Date</th></tr></thead><tbody>`
            + list.map((c) => `<tr><td class="mono">#${esc(c.caseNumber)}</td><td>${esc(c.targetTag || c.targetId || "—")}</td><td>${esc(c.action || "—")}</td><td class="truncate" title="${esc(c.reason || "")}">${esc(c.reason || "—")}</td><td>${esc(c.moderatorTag || "—")}</td><td>${relTime(c.createdAt)}</td></tr>`).join("")
            + `</tbody></table></div><p class="count-note">${list.length} shown · up to 25 most recent</p>`;
        const content = `<div class="page-head"><h1>Moderation</h1><p>Recent moderation cases for this server.</p></div><section class="card" aria-label="Moderation cases">${body}</section>`;
        res.send(shell({ title: "Moderation", crumb: "Moderation", gid: req.params.guildId, session, active: "moderation", content }));
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
        const body = list.length === 0
            ? emptyState(ICONS.log, "No log entries", "Audit log entries for moderation will appear here.")
            : `<div class="table-wrap"><table><thead><tr><th scope="col">Time</th><th scope="col">Category</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead><tbody>`
            + list.map((h) => `<tr><td>${relTime(h.createdAt)}</td><td>${esc(h.category || "—")}</td><td>${esc(h.action || "—")}</td><td class="mono">${esc(shortId(h.actorId) || "—")}</td><td class="mono">${esc(shortId(h.targetId) || "—")}</td><td class="truncate" title="${esc(h.details || "")}">${esc(h.details || "—")}</td></tr>`).join("")
            + `</tbody></table></div><p class="count-note">${list.length} shown · up to 50 most recent</p>`;
        const content = `<div class="page-head"><h1>Mod Log</h1><p>Audit trail of moderation-related activity for this server.</p></div><section class="card" aria-label="Moderation log">${body}</section>`;
        res.send(shell({ title: "Mod Log", crumb: "Mod Log", gid: req.params.guildId, session, active: "logs", content }));
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
        const val = (v) => esc(v ?? "");
        const arr = (v) => esc(Array.isArray(v) ? v.join(", ") : "");
        const pretty = (v) => {
            try { return esc(typeof v === "string" ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v, null, 2)); }
            catch { return esc(String(v ?? "")); }
        };
        const body = !c
            ? emptyState(ICONS.settings, "No configuration found", "Configuration will be created automatically once the bot sees this server.")
            : `<form id="settingsForm" action="/api/guild/${esc(req.params.guildId)}/config" method="POST" novalidate>`
            + `<section class="card" aria-labelledby="s-general" style="margin-bottom:.9rem"><h2 class="section-title" id="s-general">General</h2><p class="section-sub">Basic bot behaviour for this server.</p>`
            + `<div class="field"><label for="f-prefix">Command prefix</label><p class="hint">Prefix the bot listens for, e.g. !</p><input class="input" id="f-prefix" name="prefix" type="text" maxlength="3" value="${val(c.prefix || "!")}" autocomplete="off" style="max-width:120px"></div></section>`
            + `<section class="card" aria-labelledby="s-channels" style="margin-bottom:.9rem"><h2 class="section-title" id="s-channels">Channels</h2><p class="section-sub">Channel IDs used for logging, welcomes and tickets. Leave blank to disable.</p><div class="form-grid">`
            + [["logChannelId", "Log channel", "General event log"], ["modLogChannelId", "Mod log channel", "Moderation actions"], ["welcomeChannelId", "Welcome channel", "New member greetings"], ["goodbyeChannelId", "Goodbye channel", "Member farewells"], ["ticketCategoryId", "Ticket category", "Category for ticket channels"], ["ticketLogChannelId", "Ticket log channel", "Ticket transcripts and events"]].map(([k, lb, hint]) => `<div class="field"><label for="f-${k}">${lb}</label><p class="hint">${hint}</p><input class="input" id="f-${k}" name="${k}" type="text" inputmode="numeric" placeholder="Channel ID" value="${val(c[k])}" autocomplete="off"></div>`).join("")
            + `</div></section>`
            + `<section class="card" aria-labelledby="s-roles" style="margin-bottom:.9rem"><h2 class="section-title" id="s-roles">Roles</h2><p class="section-sub">Comma-separated role IDs. Staff can manage tickets; moderators get extra permissions.</p><div class="form-grid">`
            + `<div class="field"><label for="f-staff">Staff role IDs</label><input class="input" id="f-staff" name="staffRoleIds" type="text" placeholder="123…, 456…" value="${arr(c.staffRoleIds)}" autocomplete="off"></div>`
            + `<div class="field"><label for="f-mod">Moderator role IDs</label><input class="input" id="f-mod" name="moderatorRoleIds" type="text" placeholder="123…, 456…" value="${arr(c.moderatorRoleIds)}" autocomplete="off"></div>`
            + `</div></section>`
            + `<section class="card" aria-labelledby="s-adv" style="margin-bottom:.9rem"><h2 class="section-title" id="s-adv">Advanced</h2><p class="section-sub">Read-only module state. These are managed by bot commands.</p>`
            + `<div class="field"><label>Modules</label><pre class="codeblock">${pretty(c.modules)}</pre></div>`
            + `<div class="field"><label>Automod</label><pre class="codeblock">${pretty(c.automod)}</pre></div>`
            + `<div class="field"><label>Orders</label><pre class="codeblock">${pretty(c.orders)}</pre></div></section>`
            + `<div class="savebar"><button class="btn btn-primary" id="saveSettings" type="submit">Save changes</button><button class="btn btn-secondary" id="resetSettings" type="button">Reset</button><span class="form-status" id="formStatus" aria-live="polite"></span></div></form>`;
        const content = `<div class="page-head"><h1>Server Settings</h1><p>Configure how .pulse behaves in this server. Changes save immediately.</p></div>${body}`;
        res.send(shell({ title: "Server Settings", crumb: "Server Settings", gid: req.params.guildId, session, active: "settings", content }));
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
