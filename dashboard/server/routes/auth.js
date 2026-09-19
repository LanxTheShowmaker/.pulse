import { Router } from "express";
import crypto from "crypto";
import { logger } from "../../../core/logger.js";
import { createSession, deleteSessionByToken, SESSION_TTL_MS } from "../services/session.js";
import { discordOAuthURL, discordTokenExchange, fetchDiscordUser, fetchDiscordGuilds } from "../services/oauth.js";

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
                return res.status(400).send("OAuth failed: invalid state. <a href=\"/auth/discord\">Try again</a>");
            }
            if (!code) {
                return res.status(400).send("OAuth failed: authorization denied. <a href=\"/auth/discord\">Try again</a>");
            }
            const tok = await discordTokenExchange(code);
            if (tok.error) {
                logger.info("oauth", `token exchange rejected: ${tok.error}`);
                return res.status(400).send(`OAuth failed: ${tok.error_description || tok.error}. <a href="/auth/discord">Try again</a>`);
            }
            const user = await fetchDiscordUser(tok.access_token);
            const guilds = await fetchDiscordGuilds(tok.access_token);
            const session = await createSession(user.id, guilds[0]?.id || null);
            logger.info("oauth", `session created for user ${user.id}`);
            res.cookie("session_token", session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_TTL_MS, signed: true, path: "/" });
            res.redirect("/dashboard");
        } catch (e) {
            logger.error("oauth", "callback", e?.message);
            res.status(500).send("OAuth failed: could not complete authentication. <a href=\"/auth/discord\">Try again</a>");
        }
    });

    router.post("/auth/logout", async (req, res) => {
        const t = req.signedCookies?.session_token;
        if (t) await deleteSessionByToken(t);
        res.clearCookie("session_token");
        res.clearCookie("oauth_state");
        res.redirect("/auth/discord");
    });

    return router;
}
