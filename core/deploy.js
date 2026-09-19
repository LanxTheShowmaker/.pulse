import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./registry.js";
import { logger } from "./logger.js";

async function deploy() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    if (!token || !clientId) { logger.error("deploy", "DISCORD_TOKEN and CLIENT_ID required"); process.exit(1); }

    const args = process.argv.slice(2);
    const guildFlag = args.includes("--guild") || args.includes("-g");
    const guildArg = args.find(a => a.startsWith("--guild="));
    const guildId = (guildArg ? guildArg.split("=")[1] : "") || process.env.GUILD_ID || "";

    const commands = await loadCommands();
    const body = [...commands.values()].map(c => c.data.toJSON());

    const rest = new REST().setToken(token);

    try {
        if (guildFlag || guildId) {
            if (!guildId) { logger.error("deploy", "GUILD_ID required for guild deployment"); process.exit(1); }
            logger.info("deploy", `deploying ${body.length} commands to guild ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
            logger.info("deploy", `deployed ${body.length} commands to guild ${guildId}`);
        } else {
            logger.info("deploy", `deploying ${body.length} commands globally...`);
            await rest.put(Routes.applicationCommands(clientId), { body });
            logger.info("deploy", `deployed ${body.length} commands globally`);
        }
    } catch (e) {
        logger.error("deploy", "deployment failed", e);
    }
}

deploy();
