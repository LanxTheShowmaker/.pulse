import { join } from "node:path";
import { logger } from "../../../core/logger.js";

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function isApiRoute(req) {
    return req.path.startsWith("/api/");
}

// 404: JSON for API routes, dashboard 404 page for browser routes.
export function notFound(req, res) {
    if (isApiRoute(req)) return res.status(404).json({ error: "Not found." });
    res.status(404).sendFile("404.html", { root: PUBLIC_DIR });
}

// 500: log full diagnostics server-side, safe message to the client.
export function errorHandler(err, req, res, next) {
    logger.error(
        "dashboard",
        `error on ${req.method} ${req.path} user=${req.userId || "-"} guild=${req.params?.guildId || req.guildId || "-"}`,
        err?.stack || err,
    );
    if (isApiRoute(req)) return res.status(500).json({ error: "Internal error." });
    res.status(500).json({ error: "Internal error." });
}
