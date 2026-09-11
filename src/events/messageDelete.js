import { logger } from "../core/logger.js";

export default {
    name: "messageDelete",
    async execute(message, client) {
        try {
        if (message.partial)
            return;
        if (message.author?.bot)
            return;
        if (!message.inGuild())
            return;
        await client.services.logging
            .logMessage(message.guild, "delete", {
            authorTag: message.author?.tag ?? "unknown",
            authorId: message.author?.id ?? "unknown",
            channel: `#${message.channel?.name ?? message.channelId}`,
            content: message.content,
        })
        .catch((e) => logger.warn("logging", "logMessage failed", e.message));
        } catch (e) {
            logger.error("messageDelete", "unhandled error", e?.message);
        }
    },
};
//# sourceMappingURL=messageDelete.js.map