import { isIgnored } from "../core/services.js";
import { logger } from "../core/logger.js";

export default {
    name: "messageCreate",
    async execute(message, client) {
        if (message.author.bot || message.system)
            return;
        const guildId = message.guildId;
        // Handle prefix commands first (before automod/leveling to allow prefix help even if automod would block)
        // Use prefix service with caching — does not query DB every message more than once per 5m per guild
        try {
            const isPrefixCmd = await client.services.prefix?.handleMessage(message).catch(() => false);
            if (isPrefixCmd) return;
        } catch (e) {
            logger.warn("prefix", "handle failed", e.message);
        }
        const config = await client.services.settings.get(guildId).catch((e) => {
            logger.warn("messageCreate", "settings get failed", e.message);
            return null;
        });
        const modules = config?.modules || {};
        // Audit & analytics for every message (lightweight)
        if (modules.analytics !== false) {
            client.services.audit?.log(guildId, { actorId: message.author.id, action: "message", category: "message", details: { channelId: message.channel.id, length: (message.content || "").length } })
                .catch((e) => logger.warn("audit", "log failed", e.message));
        }
        // Raid: track message velocity
        if (modules.automod !== false) {
            client.services.raid?.trackMessage(guildId);
            // Trigger raid check if flood
            const cnt = client.services.raid?.msgWindow?.get(guildId)?.length || 0;
            if (cnt > 12) client.services.raid?.maybeTrigger(message.guild, "message_flood")
                .catch((e) => logger.warn("raid", "maybeTrigger failed", e.message));
        }
        if (config && modules.automod !== false && !isIgnored(message.member, config)) {
            await client.services.automod.handleMessage(message)
                .catch((e) => logger.error("automod", "handler failed", e));
        }
        // Public features — all guild-isolated, respect modules
        if (modules.leveling !== false) await client.services.leveling.handleMessage(message)
            .catch((e) => logger.error("leveling", "handle", e));
        if (modules.economy !== false) await client.services.economy.handleMessage(message)
            .catch((e) => logger.error("economy", "handle", e));
        await client.services.afk.handleMessage(message)
            .catch((e) => logger.error("afk", "handle", e));
        // Automation trigger for message
        client.services.automation?.trigger(guildId, "messageCreate", { userId: message.author.id, channelId: message.channel.id, content: message.content?.slice(0, 100) })
            .catch((e) => logger.warn("automation", "trigger failed", e.message));
    },
};
//# sourceMappingURL=messageCreate.js.map