import "dotenv/config";
import { GatewayIntentBits, Partials } from "discord.js";
import { PulseClient } from "./client.js";
import { loadCommands, loadEvents } from "./registry.js";
import { createServices } from "./services.js";
import { logger } from "./logger.js";

async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        logger.error("bootstrap", "DISCORD_TOKEN is missing");
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

    // Load commands
    client.commands = await loadCommands();

    // Register component handlers from commands
    for (const [name, cmd] of client.commands) {
        if (cmd.componentHandlers) {
            for (const [customId, handler] of Object.entries(cmd.componentHandlers)) {
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

    await client.login(token);
    logger.info("bootstrap", `.pulse online as ${client.user?.tag ?? "unknown"}`);

    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info("bootstrap", `Received ${signal}, shutting down...`);
        try {
            await client.services.prisma.$disconnect();
        } catch {}
        client.destroy();
        process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
    logger.error("bootstrap", "fatal startup error", e);
    process.exit(1);
});
//# sourceMappingURL=bootstrap.js.map