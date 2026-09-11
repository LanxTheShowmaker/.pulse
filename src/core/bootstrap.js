import "dotenv/config";
import { GatewayIntentBits, Partials } from "discord.js";
import { PulseClient } from "./client.js";
import { loadCommands, loadEvents } from "./registry.js";
import { createServices, initDatabase } from "./services.js";
import { logger } from "./logger.js";

process.on("unhandledRejection", (e) => logger.error("process", "unhandledRejection", e));
process.on("uncaughtException", (e) => logger.error("process", "uncaughtException", e));

async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        logger.error("bootstrap", "DISCORD_TOKEN is missing");
        process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
        logger.error("bootstrap", "DATABASE_URL is missing");
        process.exit(1);
    }

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

    // Initialize services first (before commands/events that depend on them)
    client.services = createServices(client);

    // Connect database before accepting any work
    await initDatabase(client.services.prisma);

    // Load commands
    client.commands = await loadCommands();

    // Register component handlers from commands
    for (const [name, cmd] of client.commands) {
        if (cmd.componentHandlers) {
            for (const [customId, handler] of Object.entries(cmd.componentHandlers)) {
                if (client.components.has(customId)) {
                    logger.warn("bootstrap", `Duplicate component handler: ${customId} (from ${name})`);
                    continue;
                }
                client.components.set(customId, handler);
            }
        }
    }

    // Load and register events
    const events = await loadEvents();
    for (const event of events) {
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }

    // Graceful shutdown (registered before login so early failures also clean up)
    const shutdown = async (signal) => {
        logger.info("bootstrap", `Received ${signal}, shutting down...`);
        try {
            for (const svc of Object.values(client.services)) {
                if (svc && typeof svc.shutdown === "function") {
                    await svc.shutdown().catch((e) => logger.warn("bootstrap", "service shutdown failed", e?.message));
                }
            }
            await client.services.prisma.$disconnect();
        } catch {}
        client.destroy();
        process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    client.on("shardDisconnect", (e, id) => logger.warn("shard", `shard ${id} disconnected`, e?.code));
    client.on("shardReconnecting", (id) => logger.warn("shard", `shard ${id} reconnecting`));
    client.on("shardResume", (id) => logger.info("shard", `shard ${id} resumed`));
    client.on("guildUnavailable", (guild) => logger.warn("shard", `guild unavailable: ${guild?.id}`));

    await client.login(token);
    logger.info("bootstrap", `.pulse online as ${client.user?.tag ?? "unknown"}`);
}

main().catch((e) => {
    logger.error("bootstrap", "fatal startup error", e);
    process.exit(1);
});
//# sourceMappingURL=bootstrap.js.map