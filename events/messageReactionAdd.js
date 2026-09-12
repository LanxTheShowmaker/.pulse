import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, client) {
        try {
            if (reaction.message.partial) await reaction.message.fetch();
            await client.services.starboard.handleReactionAdd(reaction, user);
            await client.services.reactionRoles.handleReactionAdd(reaction, user);
        } catch (e) {
            logger.error("events", "reactionAdd failed", e.message);
        }
    },
};
