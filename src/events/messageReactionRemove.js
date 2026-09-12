import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.MessageReactionRemove,
    async execute(reaction, user, client) {
        try {
            if (reaction.message.partial) await reaction.message.fetch();
            await client.services.reactionRoles.handleReactionRemove(reaction, user);
            await client.services.starboard.handleReactionRemove(reaction, user);
        } catch (e) {
            logger.error("events", "reactionRemove failed", e.message);
        }
    },
};
