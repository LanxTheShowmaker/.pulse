import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.GuildMemberRemove,
    async execute(member, client) {
        try {
            const config = await client.services.settings.get(member.guild.id);
            if (!config.goodbyeChannelId) return;
            const ch = member.guild.channels.cache.get(config.goodbyeChannelId);
            if (!ch?.isTextBased()) return;

            await ch.send({ content: `${member.user.tag ?? member.displayName} has left.` }).catch(() => {});
        } catch (e) {
            logger.error("events", "guildMemberRemove failed", e.message);
        }
    },
};
