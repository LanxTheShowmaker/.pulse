import "dotenv/config";
import { REST, Routes } from "discord.js";
import { pathToFileURL } from "node:url";
import { loadCommands } from "./registry.js";
import { logger } from "./logger.js";

async function deploy() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    if (!token || !clientId) { logger.error("deploy", "DISCORD_TOKEN and CLIENT_ID required"); process.exit(1); }

    const args = process.argv.slice(2);
    // Accepts "--guild <id>", "-g <id>", "--guild=<id>" and a bare "<id>".
    // npm strips "--guild=<id>" entirely (it looks like an npm config flag), so
    // the documented form is the space-separated one.
    const guildArg = args.find(a => a.startsWith("--guild="));
    const flagAt = args.findIndex(a => a === "--guild" || a === "-g");
    const positional = flagAt >= 0 ? args[flagAt + 1] : "";
    const bare = args.find(a => /^\d{5,32}$/.test(a));
    const envGuild = process.env.GUILD_ID || "";
    const guildId = (guildArg ? guildArg.split("=")[1] : "") || positional || bare || envGuild || "";
    // A guild flag with no usable id is a user error: fail loudly rather than
    // silently falling through to a global deployment.
    const wantsGuild = flagAt >= 0 || Boolean(guildArg) || Boolean(bare) || Boolean(envGuild);

    const commands = await loadCommands();
    const body = [...commands.values()].map(c => c.data.toJSON());

    // Validate before any network call: a guild flag with no id must not
    // fall through to a global deployment.
    if (wantsGuild && !guildId) {
        logger.error("deploy", "GUILD_ID required for guild deployment (pass it as: npm run deploy -- --guild <id>)");
        process.exit(1);
    }

    const rest = new REST().setToken(token);

    try {
        if (guildId) {
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

// Only run when executed directly. Without this guard, any module that
// imports deploy.js (e.g. a lint/verification sweep) would trigger a real
// global command registration as a side effect of loading the file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    deploy();
}
