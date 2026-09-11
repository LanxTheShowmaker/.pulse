import { Events } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        try {
            const config = await client.services.settings.get(member.guild.id);
            if (!config.welcomeChannelId) return;
            const ch = member.guild.channels.cache.get(config.welcomeChannelId);
            if (!ch?.isTextBased()) return;

            await ch.send({ content: `Welcome ${member}, you are member #${member.guild.memberCount}.` }).catch(() => {});
        } catch (e) {
            logger.error("events", "guildMemberAdd failed", e.message);
        }
    },
};
