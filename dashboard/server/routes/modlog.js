import { Router } from "express";

export function createModlogRouter(deps) {
    const { logging } = deps;
    const router = Router();

    router.get("/api/guild/:guildId/logs/mod", async (req, res) => {
        try { res.json(await logging.getModLogHistory(req.params.guildId, 50)); }
        catch (e) { res.status(500).json({ error: "Failed." }); }
    });

    return router;
}
