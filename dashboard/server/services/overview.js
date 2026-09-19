import { getGuildInfo, getBotStatus } from "./guild.js";

const CHANNEL_FIELDS = ["logChannelId", "modLogChannelId", "welcomeChannelId", "goodbyeChannelId", "ticketCategoryId", "ticketLogChannelId"];

// One aggregated payload for the dashboard home page, composed
// exclusively from existing bot services + live client state.
export async function getOverview(deps, guildId) {
    const { settings, tickets, moderation } = deps;
    const [config, stats, openTickets, recentCases, caseStats, bot] = await Promise.all([
        settings.get(guildId),
        tickets.getStats(guildId),
        tickets.getOpenTicketsSummary(guildId, 8),
        moderation.getRecentCasesApi(guildId, 5),
        moderation.getCaseStatsApi(guildId).catch(() => ({ total: 0, byAction: {} })),
        getBotStatus(),
    ]);

    const channelsSet = CHANNEL_FIELDS.filter((k) => config?.[k]).length;
    return {
        guild: getGuildInfo(guildId) || { id: guildId, name: null, icon: null, memberCount: null },
        bot,
        stats: {
            open: stats.open ?? 0,
            closed: stats.closed ?? 0,
            total: stats.total ?? 0,
            avgRating: stats.avgRating ?? null,
            ratedCount: stats.ratedCount ?? 0,
        },
        configSnapshot: {
            prefix: config?.prefix || "!",
            channelsSet,
            channelFields: CHANNEL_FIELDS.length,
            staffRoles: Array.isArray(config?.staffRoleIds) ? config.staffRoleIds.length : 0,
            modRoles: Array.isArray(config?.moderatorRoleIds) ? config.moderatorRoleIds.length : 0,
        },
        caseStats,
        recentTickets: openTickets,
        recentCases,
    };
}
