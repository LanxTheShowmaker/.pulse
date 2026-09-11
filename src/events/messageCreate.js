import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // AutoMod
        try {
            await client.services.automod.handleMessage(message);
        } catch (e) {
            logger.error("events", "automod handler failed", e.message);
        }
    },
};
