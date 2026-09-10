import { logger } from "../core/logger.js";

export default {
    name: "guildMemberRemove",
    async execute(member, client) {
        const guildId = member.guild?.id ?? member.id;
        await client.services.logging.logMember(member.guild, "leave", { tag: member.user.tag, id: member.id })
            .catch((e) => logger.warn("logging", "logMember failed", e.message));
        await client.services.audit?.log(guildId, { actorId: member.id, action: "leave", category: "member", details: { tag: member.user.tag } })
            .catch((e) => logger.warn("audit", "log failed", e.message));
        client.services.automation?.trigger(guildId, "memberLeave", { userId: member.id })
            .catch((e) => logger.warn("automation", "trigger failed", e.message));
    },
};
//# sourceMappingURL=guildMemberRemove.js.map