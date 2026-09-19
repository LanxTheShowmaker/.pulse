import { Router } from "express";
import { logger } from "../../../core/logger.js";
import { validateSettingsBody } from "../middleware/validate.js";

export function createSettingsRouter(deps) {
    const { settings } = deps;
    const router = Router();

    router.get("/api/guild/:guildId/config", async (req, res) => {
        try { res.json(await settings.get(req.params.guildId)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    router.patch("/api/guild/:guildId/config", validateSettingsBody, async (req, res) => {
        try {
            await settings.patch(req.params.guildId, req.cleanSettings);
            res.json(await settings.get(req.params.guildId));
        } catch (e) {
            logger.error("api", `patch config failed for ${req.params.guildId}`, e?.message);
            res.status(500).json({ error: "Failed." });
        }
    });

    return router;
}
