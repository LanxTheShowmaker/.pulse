import "dotenv/config";
import { GatewayIntentBits, Partials } from "discord.js";
import { PulseClient } from "./client.js";
import { loadCommands, loadEvents, loadHandlers } from "./registry.js";
import { createServices, initDatabase, shutdownServices } from "./services.js";
import { logger } from "./logger.js";

process.on("unhandledRejection", e => logger.error("process", "unhandledRejection", e));
process.on("uncaughtException", e => logger.error("process", "uncaughtException", e));

async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) { logger.error("bootstrap", "DISCORD_TOKEN missing"); process.exit(1); }
    if (!process.env.DATABASE_URL) { logger.error("bootstrap", "DATABASE_URL missing"); process.exit(1); }

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
    await initDatabase(client.services.prisma);

    client.commands = await loadCommands();

    const handlers = await loadHandlers();
    for (const [id, handler] of handlers) {
        client.components.set(id, handler);
    }

    const events = await loadEvents();
    for (const evt of events) {
        if (evt.once) client.once(evt.name, (...args) => evt.execute(...args, client));
        else client.on(evt.name, (...args) => evt.execute(...args, client));
    }

    const shutdown = async (signal) => {
        logger.info("bootstrap", `${signal}, shutting down`);
        try {
            await shutdownServices(client.services);
            await client.services.prisma.$disconnect();
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
}

main().catch(e => { logger.error("bootstrap", "fatal", e); process.exit(1); });
