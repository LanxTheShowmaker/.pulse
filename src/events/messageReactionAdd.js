import { logger } from "../core/logger.js";

export default {
    name: "messageReactionAdd",
    async execute(reaction, user, client) {
        if (!client?.services?.starboard) return;
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (e) {
                logger.warn("starboard", "fetch reaction failed", e.message);
                return;
            }
        }
        await client.services.starboard.handleReactionAdd(reaction, user)
            .catch((e) => logger.error("starboard", "handleReactionAdd failed", e));
    }
};
//# sourceMappingURL=messageReactionAdd.js.map