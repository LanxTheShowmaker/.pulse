import { isIgnored } from "../core/services.js";
import { logger } from "../core/logger.js";

export default {
    name: "guildMemberAdd",
    async execute(member, client) {
        try {
        const guildId = member.guild.id;
        await client.services.logging.logMember(member.guild, "join", { tag: member.user.tag, id: member.id })
            .catch((e) => logger.warn("logging", "logMember failed", e.message));
        await client.services.audit?.log(guildId, { actorId: member.id, action: "join", category: "member", details: { tag: member.user.tag } })
            .catch((e) => logger.warn("audit", "log failed", e.message));
        await client.services.welcome.handleJoin(member)
            .catch((e) => logger.warn("welcome", "handleJoin failed", e.message));
        await client.services.automod.handleJoin(member)
            .catch((e) => logger.warn("automod", "handleJoin failed", e.message));
        // Raid: track join burst
        let joins = 0;
        try {
            joins = client.services.raid?.trackJoin(guildId) ?? 0;
        } catch (e) {
            logger.warn("raid", "trackJoin failed", e.message);
        }
        if (joins > 5) client.services.raid?.maybeTrigger(member.guild, "join_spike")
            .catch((e) => logger.warn("raid", "maybeTrigger failed", e.message));
        // Intelligence: assess new account
        try {
            const ageMs = Date.now() - (member.user.createdAt?.getTime() ?? Date.now());
            const score = client.services.intelligence?.scoreJoin({ accountAgeMs: ageMs, recentJoinsCount: joins });
            if (score && score.level === "HIGH") {
                await client.services.audit?.log(guildId, { actorId: member.id, action: "suspicious_join", category: "automod", details: score });
            }
        } catch (e) {
            logger.warn("intelligence", "scoreJoin failed", e.message);
        }
        client.services.automation?.trigger(guildId, "memberJoin", { userId: member.id, accountAge: member.user.createdAt })
            .catch((e) => logger.warn("automation", "trigger failed", e.message));
        // Analytics handled via audit
        } catch (e) {
            logger.error("guildMemberAdd", "unhandled error", e?.message);
        }
    },
};
//# sourceMappingURL=guildMemberAdd.js.map