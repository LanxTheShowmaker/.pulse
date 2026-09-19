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
import { createAuthRouter } from "./server/routes/auth.js";
import { createApiRouter } from "./server/routes/api.js";
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

// ── Public routes ───────────────────────────────────────
expressApp.get("/", (req, res) => { res.redirect("/dashboard"); });
expressApp.use(createAuthRouter());

// ── Everything below requires authentication ────────────
expressApp.use(requireAuth);

// Static frontend files (HTML/CSS/JS/assets). Served only to
// authenticated sessions; server source, .env and Prisma files
// live outside PUBLIC_DIR and are never exposed.
expressApp.use(express.static(PUBLIC_DIR, { index: false, redirect: false }));

// Guild authorization for every guild-scoped route (API + pages).
expressApp.use("/api/guild/:guildId", validateGuildId, requireGuildAuth);
expressApp.use("/dashboard/guild/:guildId", validateGuildId, requireGuildAuth);

expressApp.use(createApiRouter(deps));
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
