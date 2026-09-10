import { logger } from "../core/logger.js";

export default {
    name: "messageDelete",
    async execute(message, client) {
        if (message.partial)
            return;
        if (message.author?.bot)
            return;
        if (!message.inGuild())
            return;
        await client.services.logging
            .logMessage(message.guild, "delete", {
            authorTag: message.author.tag,
            authorId: message.author.id,
            channel: `#${message.channel.name ?? message.channelId}`,
            content: message.content,
        })
        .catch((e) => logger.warn("logging", "logMessage failed", e.message));
    },
};
//# sourceMappingURL=messageDelete.js.map