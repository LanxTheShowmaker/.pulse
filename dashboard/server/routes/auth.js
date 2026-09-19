import { Router } from "express";
import crypto from "crypto";
import { eq, and, notInArray } from "drizzle-orm";
import { logger } from "../../../core/logger.js";
import { getDb } from "../../../db/index.js";
import { dashboardGuild } from "../../../db/schema/index.js";
import { createSession, deleteSessionByToken, SESSION_TTL_MS } from "../services/session.js";
import { discordOAuthURL, discordTokenExchange, fetchDiscordUser, fetchDiscordGuilds } from "../services/oauth.js";
import { guildManageable, botInGuild } from "../services/access.js";

// Persist the user's manageable guilds (verified from the live OAuth
// guild list at login). The access token itself is never stored.
async function snapshotGuilds(userId, guilds) {
    const db = getDb();
    const list = Array.isArray(guilds) ? guilds : [];
    const manageable = list.filter(guildManageable);
    const seen = new Set();
    for (const g of manageable) {
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        const row = {
            userId,
            guildId: g.id,
            name: g.name || null,
            icon: g.icon || null,
            permissions: String(g.permissions ?? "0"),
            manage: true,
            owner: g.owner === true,
        };
        await db.insert(dashboardGuild).values(row)
            .onDuplicateKeyUpdate({
                set: {
                    name: row.name, icon: row.icon, permissions: row.permissions,
                    manage: true, owner: row.owner,
                },
            });
    }
    // Prune servers the user can no longer manage.
    if (seen.size > 0) {
        await db.delete(dashboardGuild)
            .where(and(eq(dashboardGuild.userId, userId), notInArray(dashboardGuild.guildId, [...seen])))
            .catch(() => {});
    } else {
        await db.delete(dashboardGuild).where(eq(dashboardGuild.userId, userId)).catch(() => {});
    }
    return manageable;
}

export function createAuthRouter() {
    const router = Router();

    router.get("/auth/discord", (req, res) => {
        const state = crypto.randomBytes(32).toString("hex");
        res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
        res.redirect(discordOAuthURL(state));
    });

    router.get("/auth/discord/callback", async (req, res) => {
        try {
            const { code, state } = req.query;
            const oauthState = req.cookies?.oauth_state;
            if (!state || !oauthState || state !== oauthState) {
                logger.info("oauth", "callback rejected: invalid state");
                return res.status(400).send("OAuth failed: invalid state. <a href=\"/login\">Try again</a>");
            }
            if (!code) {
                return res.status(400).send("OAuth failed: authorization denied. <a href=\"/login\">Try again</a>");
            }
            const tok = await discordTokenExchange(code);
            if (tok.error) {
                logger.info("oauth", `token exchange rejected: ${tok.error}`);
                return res.status(400).send(`OAuth failed: ${tok.error_description || tok.error}. <a href="/login">Try again</a>`);
            }
            const user = await fetchDiscordUser(tok.access_token);
            const guilds = await fetchDiscordGuilds(tok.access_token);
            const manageable = await snapshotGuilds(user.id, guilds);
            // Prefer a manageable guild where the bot is actually present.
            const primary = manageable.find((g) => botInGuild(g.id)) || manageable[0];
            const session = await createSession(user.id, primary?.id || null);
            logger.info("oauth", `session created for user ${user.id} (${manageable.length} manageable guilds)`);
            res.cookie("session_token", session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_TTL_MS, signed: true, path: "/" });
            res.redirect("/select-server");
        } catch (e) {
            logger.error("oauth", "callback", e?.message);
            res.status(500).send("OAuth failed: could not complete authentication. <a href=\"/login\">Try again</a>");
        }
    });

    router.post("/auth/logout", async (req, res) => {
        const t = req.signedCookies?.session_token;
        if (t) await deleteSessionByToken(t);
        res.clearCookie("session_token");
        res.clearCookie("oauth_state");
        res.redirect("/login");
    });

    // Spec routing rule: logout is POST. GET logout (e.g. typed URL)
    // redirects to the login page instead of crashing.
    router.get("/auth/logout", (req, res) => res.redirect("/login"));

    return router;
}
