import { logger } from "../../../core/logger.js";
import { hashToken, validateSession } from "../services/session.js";

export function isApiRoute(req) {
    return req.path.startsWith("/api/");
}

// Browser: unauthenticated -> redirect to Discord login.
// API: unauthenticated -> 401 JSON. Never reveals why beyond expiry state.
export async function requireAuth(req, res, next) {
    const token = req.signedCookies?.session_token;
    if (!token) {
        if (isApiRoute(req)) return res.status(401).json({ error: "Authentication required." });
        return res.redirect("/auth/discord");
    }
    try {
        const session = await validateSession(token);
        if (!session) {
            res.clearCookie("session_token");
            logger.info("auth", `expired/invalid session for ${req.method} ${req.path}`);
            if (isApiRoute(req)) return res.status(401).json({ error: "Session expired." });
            return res.redirect("/auth/discord");
        }
        req.session = session;
        req.userId = session.userId;
        req.guildId = session.guildId;
        next();
    } catch (e) {
        logger.error("auth", `session validation failed for ${req.method} ${req.path}`, e?.message);
        res.clearCookie("session_token");
        if (isApiRoute(req)) return res.status(401).json({ error: "Authentication failed." });
        return res.redirect("/auth/discord");
    }
}

// Never trust req.params.guildId alone: the session's guild must match.
export function requireGuildAuth(req, res, next) {
    const gid = req.params.guildId;
    if (!gid) {
        if (isApiRoute(req)) return res.status(400).json({ error: "Guild ID required." });
        return res.status(400).send("Guild ID required.");
    }
    if (!req.guildId) {
        logger.info("auth", `guild auth denied: user ${req.userId} has no session guild for ${req.method} ${req.path}`);
        if (isApiRoute(req)) return res.status(403).json({ error: "No guild associated with session." });
        return res.status(403).send("No guild associated with session.");
    }
    if (req.guildId !== gid) {
        logger.info("auth", `guild auth denied: user ${req.userId} session guild ${req.guildId} != requested ${gid} for ${req.method} ${req.path}`);
        if (isApiRoute(req)) return res.status(403).json({ error: "Access denied to this guild." });
        return res.status(403).send("Access denied to this guild.");
    }
    next();
}
