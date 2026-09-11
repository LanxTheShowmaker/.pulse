import { logger } from "../core/logger.js";

export default {
    name: "messageUpdate",
    async execute(oldMsg, newMsg, client) {
        try {
        if (oldMsg.author?.bot || newMsg.author?.bot)
            return;
        if (oldMsg.partial || newMsg.partial)
            return;
        if (!newMsg.inGuild())
            return;
        if (oldMsg.content === newMsg.content)
            return;
        await client.services.logging
            .logMessage(newMsg.guild, "edit", {
            authorTag: newMsg.author?.tag ?? "unknown",
            authorId: newMsg.author?.id ?? "unknown",
            channel: `#${newMsg.channel?.name ?? newMsg.channelId}`,
            content: newMsg.content,
            jumpUrl: newMsg.url,
        })
        .catch((e) => logger.warn("logging", "logMessage failed", e.message));
        // AutoMod edited message detection (conservative, deduplicate)
        await client.services.automod.handleMessageUpdate(oldMsg, newMsg)
            .catch((e) => logger.warn("automod", "handleMessageUpdate failed", e.message));
        } catch (e) {
            logger.error("messageUpdate", "unhandled error", e?.message);
        }
    },
};
//# sourceMappingURL=messageUpdate.js.map