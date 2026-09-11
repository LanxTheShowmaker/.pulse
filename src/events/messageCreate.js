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
            logger.error("events", "automod failed", e.message);
        }

        // Leveling
        try {
            await client.services.leveling.handleMessage(message);
        } catch (e) {
            logger.error("events", "leveling failed", e.message);
        }

        // AFK
        try {
            await client.services.afk.handleMessage(message);
        } catch (e) {
            logger.error("events", "afk failed", e.message);
        }
    },
};
