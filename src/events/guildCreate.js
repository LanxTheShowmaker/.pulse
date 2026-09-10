import { logger } from "../core/logger.js";

export default {
    name: "guildCreate",
    async execute(guild, client) {
        try {
            await client.services.settings.get(guild.id).catch((e) => logger.warn("settings", "get failed", e.message));
            logger.info("guildCreate", `Joined ${guild.name} (${guild.id}) — GuildConfig warmed. Run /autosetup to configure.`);
        } catch (e) {
            logger.error("guildCreate", "warmup failed", e);
        }
    },
};
//# sourceMappingURL=guildCreate.js.map