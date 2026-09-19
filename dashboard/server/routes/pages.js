import { Router } from "express";
import { join } from "node:path";

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function page(file) {
    return (req, res) => res.sendFile(file, { root: PUBLIC_DIR });
}

// Authenticated HTML shell pages. Dynamic data loads through the JSON
// APIs; the guild-scoped pages require session-guild authorization
// (mounted under requireGuildAuth by the bootstrap).
// Canonical guild URLs:
//
//   /dashboard/guild/:guildId
//   /dashboard/guild/:guildId/tickets
//   /dashboard/guild/:guildId/moderation
//   /dashboard/guild/:guildId/modlog
//   /dashboard/guild/:guildId/settings
export function createPagesRouter() {
    const router = Router();

    // Bare overview without a selected guild: server selection owns
    // guild choice, so send the user there.
    router.get("/dashboard", (req, res) => res.redirect("/select-server"));
    router.get("/select-server", page("select-server.html"));

    router.get("/dashboard/guild/:guildId", page("dashboard/guild.html"));
    router.get("/dashboard/guild/:guildId/tickets", page("dashboard/tickets.html"));
    router.get("/dashboard/guild/:guildId/moderation", page("dashboard/moderation.html"));
    router.get("/dashboard/guild/:guildId/modlog", page("dashboard/modlog.html"));
    router.get("/dashboard/guild/:guildId/settings", page("dashboard/settings.html"));

    return router;
}
