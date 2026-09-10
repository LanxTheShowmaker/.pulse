import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./registry.js";
import { logger } from "./logger.js";

async function deploy() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildIdEnv = process.env.GUILD_ID;

    console.log("========== .PULSE COMMAND DEPLOYMENT ==========");
    console.log(`DISCORD_TOKEN: ${token ? "PRESENT (" + token.slice(0, 6) + "...)" : "MISSING"}`);
    console.log(`CLIENT_ID: ${clientId ? "PRESENT (" + clientId + ")" : "MISSING"}`);
    console.log(`GUILD_ID: ${guildIdEnv ? "PRESENT (" + guildIdEnv + ")" : "MISSING (will use global if not provided)"}`);

    if (!token || !clientId) {
        logger.error("deploy", "DISCORD_TOKEN and CLIENT_ID are required");
        console.log("DEPLOYMENT ERROR: Missing DISCORD_TOKEN or CLIENT_ID");
        process.exit(1);
    }

    let commands;
    try {
        const result = await loadCommands();
        commands = result;
        console.log(`Commands loaded: ${commands.size}`);
    } catch (e) {
        console.log("DEPLOYMENT ERROR");
        console.log(`ERROR loading commands: ${e.message}`);
        console.log(e.stack);
        process.exit(1);
    }

    if (!commands || commands.size === 0) {
        console.log("DEPLOYMENT ERROR: No commands loaded");
        process.exit(1);
    }

    let body = [];
    try {
        body = [...commands.values()].map((c) => c.data.toJSON());
        console.log(`Serialized: ${body.length}`);
    } catch (e) {
        console.log("DEPLOYMENT ERROR");
        console.log(`ERROR serializing: ${e.message}`);
        console.log(e.stack);
        process.exit(1);
    }

    // Check for duplicate names
    const names = body.map(c => c.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) {
        console.log("DEPLOYMENT ERROR");
        console.log(`ERROR: Duplicate command names: ${[...new Set(dupes)].join(", ")}`);
        process.exit(1);
    }

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        const args = process.argv.slice(2);
        const guildArg = args.find((a) => a === "--guild" || a.startsWith("--guild="));
        const globalFlag = args.includes("--global");
        let targetGuildId = null;
        let isGuild = false;

        if (guildArg) {
            targetGuildId = guildArg.includes("=") ? guildArg.split("=")[1] : process.env.GUILD_ID;
            isGuild = true;
        } else if (guildIdEnv && !globalFlag) {
            targetGuildId = guildIdEnv;
            isGuild = true;
            console.log(`Using GUILD_ID from env for guild registration (fast) — use --global to force global`);
        }

        if (isGuild) {
            if (!targetGuildId) {
                logger.error("deploy", "GUILD_ID is required for guild deploy. Set GUILD_ID in .env or use --guild=ID or --global");
                console.log("DEPLOYMENT ERROR: Missing GUILD_ID for guild registration");
                process.exit(1);
            }
            console.log(`Registering ${body.length} commands to guild ${targetGuildId}`);
            const res = await rest.put(Routes.applicationGuildCommands(clientId, targetGuildId), { body });
            console.log(`Discord API response: ${Array.isArray(res) ? res.length + " commands" : JSON.stringify(res).slice(0, 500)}`);
            logger.info("deploy", `Deployed ${body.length} commands to guild ${targetGuildId} (dev instant)`);
            console.log(`SUCCESS: Registered ${body.length} guild commands to ${targetGuildId} — visible instantly`);
        } else {
            console.log(`Registering ${body.length} commands globally (propagates up to 1h)`);
            const res = await rest.put(Routes.applicationCommands(clientId), { body });
            console.log(`Discord API response: ${Array.isArray(res) ? res.length + " commands" : JSON.stringify(res).slice(0, 500)}`);
            logger.info("deploy", `Deployed ${body.length} global commands (propagates up to 1h)`);
            console.log(`SUCCESS: Registered ${body.length} global commands — may take up to 1h to propagate`);
        }
    } catch (e) {
        console.log("DEPLOYMENT ERROR");
        console.log(`Discord API error: ${e.message}`);
        if (e.code) console.log(`Code: ${e.code}`);
        if (e.status) console.log(`HTTP Status: ${e.status}`);
        if (e.rawError) console.log(`RawError: ${JSON.stringify(e.rawError).slice(0, 1000)}`);
        console.log(e.stack);

        const code = e?.code;
        const status = e?.status;

        if (code === 50001 || status === 403) {
            const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
            logger.error("deploy", "Missing Access (50001/403): bot not in server or missing applications.commands scope");
            logger.info("deploy", `Re-invite: ${url}`);
            console.log(`Missing Access — re-invite: ${url}`);
            process.exit(1);
        }
        if (status === 401) {
            console.log("401 Unauthorized — check DISCORD_TOKEN");
            logger.error("deploy", "401 Unauthorized — invalid token");
            process.exit(1);
        }
        if (status === 404) {
            console.log("404 Unknown Application — check CLIENT_ID");
            logger.error("deploy", "404 Unknown Application");
            process.exit(1);
        }
        if (status === 400) {
            console.log("400 Invalid Form Body — check command definitions");
            if (e.rawError?.errors) console.log(JSON.stringify(e.rawError.errors, null, 2).slice(0, 2000));
        }
        logger.error("deploy", "failed to deploy commands", e);
        process.exit(1);
    }
}

deploy();
//# sourceMappingURL=deploy.js.map