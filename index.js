import "dotenv/config";
import { GatewayIntentBits, Partials } from "discord.js";
import { PulseClient } from "./core/client.js";
import { loadCommands, loadEvents, loadHandlers } from "./core/registry.js";
import { createServices, initDatabase, shutdownServices, closeDatabase } from "./core/services.js";
import { logger } from "./core/logger.js";

// Dashboard import (Phase 4: shared platform)
let dashboardServer = null;

process.on("unhandledRejection", e => logger.error("process", "unhandledRejection", e));
process.on("uncaughtException", e => logger.error("process", "uncaughtException", e));

async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) { logger.error("bootstrap", "DISCORD_TOKEN missing"); process.exit(1); }
    if (!process.env.DATABASE_URL) { logger.error("bootstrap", "DATABASE_URL missing (expected mysql://user:pass@host:port/db)"); process.exit(1); }

    // OAuth2 configuration
    const oauth2 = {
        clientId: process.env.OAUTH2_CLIENT_ID || "",
        clientSecret: process.env.OAUTH2_CLIENT_SECRET || "",
        redirectUri: process.env.OAUTH2_REDIRECT_URI || "",
        scopes: process.env.OAUTH2_SCOPTS ? process.env.OAUTH2_SCOPTS.split(",") : ["identify", "guilds"],
    };

    const client = new PulseClient({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildBans,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [Partials.GuildMember, Partials.Message, Partials.Channel, Partials.Reaction],
    });

    client.services = createServices(client);
    globalThis._client = client;

    // Run DB initialize + module registry loads concurrently: dynamic
    // imports compile on first load, so 40+ sequential imports were the
    // dominant boot cost. Everything here is independent of everything else.
    const [commands, rawHandlers, events] = await Promise.all([
        loadCommands(),
        loadHandlers(),
        loadEvents(),
        initDatabase(),
    ]);
    client.commands = commands;

    for (const [id, handler] of rawHandlers) {
        client.components.set(id, handler);
    }

    for (const evt of events) {
        if (evt.once) client.once(evt.name, (...args) => evt.execute(...args, client));
        else client.on(evt.name, (...args) => evt.execute(...args, client));
    }

    const shutdown = async (signal) => {
        logger.info("bootstrap", `${signal}, shutting down`);
        try {
            await shutdownServices(client.services);
            if (dashboardServer) await dashboardServer.close();
            await closeDatabase();
        } catch {}
        client.destroy();
        process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    client.on("shardDisconnect", (e, id) => logger.warn("shard", `shard ${id} disconnected`, e?.code));
    client.on("shardReconnecting", id => logger.warn("shard", `shard ${id} reconnecting`));
    client.on("shardResume", id => logger.info("shard", `shard ${id} resumed`));

    await client.login(token);
    logger.info("bootstrap", `.pulse online as ${client.user?.tag ?? "unknown"}`);

    // Restore persistent panels while the dashboard boots, so neither
    // blocks the other.
    const [dashboard, restored] = await Promise.all([
        startDashboardWithRetry().catch((e) => {
            logger.error("bootstrap", "Failed to start dashboard server", e);
            return null;
        }),
        client.services.panelService?.restoreAll().catch(() => 0),
    ]);
    dashboardServer = dashboard;
    if (dashboardServer) {
        logger.info("bootstrap", `.pulse dashboard listening on 0.0.0.0:${process.env.DASHBOARD_PORT || 9875}`);
    }
    if (restored) logger.info("bootstrap", `restored ${restored} persistent panel(s)`);

    // Auto-close ticket checker — polls every 60s
    setInterval(() => {
        client.services.tickets?.checkAutoClose().catch(e => {
            logger.error("tickets", `auto-close check failed: ${e.message}`);
        });
    }, 60_000);
}

async function startDashboardWithRetry() {
    const maxRetries = 5;
    const retryDelay = 2000;

    for (let retries = 0; ; ) {
        try {
            const { startServer } = await import("./dashboard/index.js");
            return await startServer();
        } catch (e) {
            if (e.code === "EADDRINUSE" && retries < maxRetries - 1) {
                retries++;
                logger.warn("bootstrap", `Dashboard port in use, retry ${retries}/${maxRetries}...`);
                await new Promise(r => setTimeout(r, retryDelay));
            } else {
                throw e;
            }
        }
    }
}

main().catch(e => { logger.error("bootstrap", "fatal", e); process.exit(1); });
