import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.GuildCreate,
    async execute(guild, client) {
        logger.info("events", `joined guild: ${guild.name} (${guild.id})`);
    },
};
