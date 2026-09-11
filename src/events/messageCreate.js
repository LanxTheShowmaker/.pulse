import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // Prefix commands — check if message starts with prefix
        // TODO: implement prefix routing when prefix service is built
    },
};
