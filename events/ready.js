import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info("ready", `.pulse online as ${client.user?.tag} • ${client.guilds.cache.size} guild(s)`);
        await client.services.branding.applyAll().catch(e => logger.warn("ready", "branding apply failed", e.message));
    },
};
