import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { join } from "node:path";
import { createServices } from "../core/services.js";
import { logger } from "../core/logger.js";
import { requireAuth, requireGuildAuth } from "./server/middleware/auth.js";
import { validateGuildId } from "./server/middleware/validate.js";
import { notFound, errorHandler } from "./server/middleware/errorHandler.js";
import { createPublicRouter } from "./server/routes/public.js";
import { createAuthRouter } from "./server/routes/auth.js";
import { createGuildsRouter } from "./server/routes/guilds.js";
import { createTicketsRouter } from "./server/routes/tickets.js";
import { createModerationRouter } from "./server/routes/moderation.js";
import { createModlogRouter } from "./server/routes/modlog.js";
import { createSettingsRouter } from "./server/routes/settings.js";
import { createPagesRouter } from "./server/routes/pages.js";

const PUBLIC_DIR = join(import.meta.dirname, "public");

const expressApp = express();
expressApp.set("trust proxy", 1);

// ── Rate limiting (after trust proxy) ───────────────────
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

// ── Bot services ────────────────────────────────────────
// Reuse the live Discord client when the dashboard runs inside the bot
// (root sets globalThis._client before importing this module). Standalone
// imports fall back to a stub: DB reads work, Discord-touching mutations
// fail gracefully instead of crashing.
const botClient = globalThis._client ?? {};
const prismaServices = createServices(botClient);
const { tickets, moderation, logging, settings } = prismaServices;
const deps = { tickets, moderation, logging, settings };

// ── Public flow: homepage, login, OAuth ─────────────────
expressApp.use(createPublicRouter());
expressApp.use(createAuthRouter());

// Public frontend assets only (CSS/JS). HTML shells are served
// exclusively through sendFile routes so server source, .env and
// Prisma files can never be exposed as static files.
expressApp.use("/css", express.static(join(PUBLIC_DIR, "css")));
expressApp.use("/js", express.static(join(PUBLIC_DIR, "js")));

// ── Everything below requires authentication ────────────
expressApp.use(requireAuth);

// Session-establishing routes mount BEFORE the guild guard: selecting a
// guild is what creates the session's guild context, and Express would
// otherwise match "/api/guild/select" as ":guildId" === "select".
expressApp.use(createGuildsRouter(deps));

// Guild authorization for every other guild-scoped route (API + pages).
expressApp.use("/api/guild/:guildId", validateGuildId, requireGuildAuth);
expressApp.use("/dashboard/guild/:guildId", validateGuildId, requireGuildAuth);

expressApp.use(createTicketsRouter(deps));
expressApp.use(createModerationRouter(deps));
expressApp.use(createModlogRouter(deps));
expressApp.use(createSettingsRouter(deps));
expressApp.use(createPagesRouter());

expressApp.use(notFound);
expressApp.use(errorHandler);

export default expressApp;

export async function startServer() {
    const { getSessionPrisma } = await import("./server/services/session.js");
    try {
        await getSessionPrisma().$connect();
        logger.info("db", "Dashboard Prisma connected.");
    } catch (e) {
        logger.error("db", "Dashboard Prisma connection failed", e);
        throw e;
    }

    return new Promise((resolve, reject) => {
        const server = expressApp.listen(process.env.DASHBOARD_PORT || 9875, "0.0.0.0", () => {
            logger.info("dashboard", ".pulse dashboard listening on 0.0.0.0:" + (process.env.DASHBOARD_PORT || 9875));
            resolve();
        });
        server.on("error", reject);
    });
}
