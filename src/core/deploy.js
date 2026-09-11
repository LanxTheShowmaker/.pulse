import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./registry.js";
import { logger } from "./logger.js";

async function deploy() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    if (!token || !clientId) { logger.error("deploy", "DISCORD_TOKEN and CLIENT_ID required"); process.exit(1); }

    const commands = await loadCommands();
    const body = [...commands.values()].map(c => c.data.toJSON());

    const rest = new REST().setToken(token);
    const guildId = process.env.GUILD_ID;

    try {
        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
            logger.info("deploy", `deployed ${body.length} commands to guild ${guildId}`);
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body });
            logger.info("deploy", `deployed ${body.length} commands globally`);
        }
    } catch (e) {
        logger.error("deploy", "deployment failed", e);
    }
}

deploy();
