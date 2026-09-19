import { Router } from "express";
import { join } from "node:path";

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function page(file) {
    return (req, res) => res.sendFile(file, { root: PUBLIC_DIR });
}

// HTML shell pages. Guild pages require session-guild authorization
// (mounted under requireGuildAuth by the bootstrap). Dynamic data is
// loaded by page JS through the JSON APIs — these files are structure.
export function createPagesRouter() {
    const router = Router();

    router.get("/dashboard", page("dashboard/index.html"));
    router.get("/dashboard/guild/:guildId", (req, res) => res.redirect("/dashboard"));
    router.get("/dashboard/guild/:guildId/tickets", page("dashboard/tickets.html"));
    router.get("/dashboard/guild/:guildId/moderation", page("dashboard/moderation.html"));
    router.get("/dashboard/guild/:guildId/modlog", page("dashboard/modlog.html"));
    router.get("/dashboard/guild/:guildId/settings", page("dashboard/settings.html"));

    return router;
}
