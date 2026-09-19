import { Router } from "express";
import { logger } from "../../../core/logger.js";
import { getSessionPrisma } from "../services/session.js";
import { getGuildInfo } from "../services/guild.js";
import { getOverview } from "../services/overview.js";
import { botInGuild } from "../services/access.js";
import { validateGuildId } from "../middleware/validate.js";
import { requireGuildAuth } from "../middleware/auth.js";

const prisma = getSessionPrisma();

function iconUrl(g) {
    if (g.icon) return `https://cdn.discordapp.com/icons/${g.guildId}/${g.icon}.png`;
    const info = getGuildInfo(g.guildId);
    return info?.icon || null;
}

export function createGuildsRouter(deps) {
    const router = Router();

    router.get("/api/user", async (req, res) => {        try {
            const s = await prisma.session.findUnique({ where: { id: req.session?.id } });
            if (!s) return res.status(401).json({ error: "Not authenticated." });
            res.json({ id: s.userId, guildId: s.guildId, expiresAt: s.expiresAt });
        } catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    // Servers this session may manage: snapshot rows (verified at login)
    // enriched with live bot presence. Never invents access.
    router.get("/api/guilds", async (req, res) => {
        try {
            const rows = await prisma.dashboardGuild.findMany({
                where: { userId: req.userId, manage: true },
                orderBy: { updatedAt: "desc" },
            });
            let memberCounts = {};
            try {
                const client = globalThis._client;
                memberCounts = Object.fromEntries(
                    rows.map((g) => [g.guildId, client?.guilds?.cache?.get(g.guildId)?.memberCount ?? null]),
                );
            } catch { memberCounts = {}; }
            res.json(rows.map((g) => ({
                id: g.guildId,
                name: g.name,
                icon: iconUrl(g),
                memberCount: memberCounts[g.guildId] ?? null,
                manage: true,
                owner: g.owner,
                botPresent: botInGuild(g.guildId),
                current: g.guildId === req.guildId,
            })));
        } catch (e) {
            logger.error("api", `guild list failed for user ${req.userId}`, e?.message);
            res.status(500).json({ error: "Failed." });
        }
    });

    // Establish the selected guild context. Every check is server-side:
    // authenticated session + snapshot row + live bot presence.
    router.post("/api/guild/select", async (req, res) => {
        try {
            const { guildId } = req.body || {};
            if (typeof guildId !== "string" || !guildId) {
                return res.status(400).json({ error: "Guild ID required." });
            }
            const row = await prisma.dashboardGuild.findUnique({
                where: { userId_guildId: { userId: req.userId, guildId } },
            });
            if (!row || !row.manage) {
                logger.info("auth", `guild select denied: user ${req.userId} has no access to ${guildId}`);
                return res.status(403).json({ error: "You cannot manage this server." });
            }
            if (!botInGuild(guildId)) {
                logger.info("auth", `guild select denied: bot not in ${guildId} (user ${req.userId})`);
                return res.status(403).json({ error: ".pulse is not installed in this server." });
            }
            await prisma.session.update({ where: { id: req.session.id }, data: { guildId } });
            logger.info("auth", `user ${req.userId} selected guild ${guildId}`);
            res.json({ success: true, guildId, redirect: `/dashboard/guild/${guildId}` });
        } catch (e) {
            logger.error("api", `guild select failed for user ${req.userId}`, e?.message);
            res.status(500).json({ error: "Failed." });
        }
    });

    router.get("/api/guild/:guildId/overview", validateGuildId, requireGuildAuth, async (req, res) => {
        try {
            res.json(await getOverview(deps, req.params.guildId));
        } catch (e) {
            logger.error("api", `overview failed for ${req.params.guildId}`, e?.message);
            res.status(500).json({ error: "Failed to load overview." });
        }
    });

    return router;
}
