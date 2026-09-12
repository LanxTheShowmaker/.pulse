import { logger } from "../core/logger.js";

const BUILTIN_ACHIEVEMENTS = [
    // Economy
    { key: "first_daily", name: "First Paycheck", description: "Claim your first daily reward", icon: "💰", category: "economy", conditions: { type: "counter", field: "dailyClaimed", target: 1 } },
    { key: "daily_streak_7", name: "Week Warrior", description: "7-day daily streak", icon: "🔥", category: "economy", conditions: { type: "streak", field: "dailyStreak", target: 7 } },
    { key: "daily_streak_30", name: "Monthly Master", description: "30-day daily streak", icon: "👑", category: "economy", conditions: { type: "streak", field: "dailyStreak", target: 30 } },
    { key: "earn_100k", name: "Big Earner", description: "Earn 100,000 total coins", icon: "💎", category: "economy", conditions: { type: "totalEarned", target: 100000 } },
    { key: "earn_1m", name: "Millionaire", description: "Earn 1,000,000 total coins", icon: "🏦", category: "economy", conditions: { type: "totalEarned", target: 1000000 } },
    { key: "first_crime", name: "First Offense", description: "Commit your first crime", icon: "🔫", category: "economy", conditions: { type: "counter", field: "crimesCommitted", target: 1 } },
    { key: "crime_10", name: "Crime Spree", description: "Commit 10 crimes", icon: "😈", category: "economy", conditions: { type: "counter", field: "crimesCommitted", target: 10 } },
    { key: "slots_win", name: "Lucky Streak", description: "Win at the slot machine", icon: "🎰", category: "economy", conditions: { type: "counter", field: "slotsWon", target: 1 } },
    { key: "slots_10", name: "Slot Regular", description: "Play the slots 10 times", icon: "🎰", category: "economy", conditions: { type: "counter", field: "slotsPlayed", target: 10 } },

    // Leveling
    { key: "level_5", name: "Getting Started", description: "Reach level 5", icon: "⭐", category: "leveling", conditions: { type: "level", target: 5 } },
    { key: "level_10", name: "Rising Star", description: "Reach level 10", icon: "🌟", category: "leveling", conditions: { type: "level", target: 10 } },
    { key: "level_25", name: "Veteran", description: "Reach level 25", icon: "💫", category: "leveling", conditions: { type: "level", target: 25 } },
    { key: "level_50", name: "Elite", description: "Reach level 50", icon: "🏆", category: "leveling", conditions: { type: "level", target: 50 } },
    { key: "level_100", name: "Legend", description: "Reach level 100", icon: "🏅", category: "leveling", conditions: { type: "level", target: 100 } },

    // Moderation
    { key: "first_mod", name: "Trial Moderator", description: "Perform your first moderation action", icon: "🔨", category: "moderation", conditions: { type: "counter", field: "modActions", target: 1 } },
    { key: "mod_10", name: "Experienced Mod", description: "Perform 10 moderation actions", icon: "⚖️", category: "moderation", conditions: { type: "counter", field: "modActions", target: 10 } },
    { key: "mod_50", name: "Senior Moderator", description: "Perform 50 moderation actions", icon: "🛡️", category: "moderation", conditions: { type: "counter", field: "modActions", target: 50 } },

    // Tickets
    { key: "first_ticket", name: "First Ticket", description: "Open your first support ticket", icon: "🎫", category: "support", conditions: { type: "counter", field: "ticketsOpened", target: 1 } },
    { key: "tickets_10", name: "Regular Customer", description: "Open 10 support tickets", icon: "📋", category: "support", conditions: { type: "counter", field: "ticketsOpened", target: 10 } },
    { key: "tickets_claimed_10", name: "Ticket Helper", description: "Claim 10 tickets as staff", icon: "🤝", category: "support", conditions: { type: "counter", field: "ticketsClaimed", target: 10 } },

    // Giveaways
    { key: "giveaway_enter_10", name: "Lucky Fan", description: "Enter 10 giveaways", icon: "🎉", category: "giveaways", conditions: { type: "counter", field: "giveawaysEntered", target: 10 } },
    { key: "giveaway_win", name: "Winner Winner", description: "Win a giveaway", icon: "🎊", category: "giveaways", conditions: { type: "counter", field: "giveawaysWon", target: 1 } },

    // Fun
    { key: "rps_play", name: "Paper Scissors Rock", description: "Play a game of RPS", icon: "✊", category: "fun", conditions: { type: "counter", field: "rpsPlayed", target: 1 } },
    { key: "trivia_win", name: "Know It All", description: "Win a trivia game", icon: "🧠", category: "fun", conditions: { type: "counter", field: "triviaWon", target: 1 } },

    // Social
    { key: "messages_100", name: "Chatterbox", description: "Send 100 messages", icon: "💬", category: "social", conditions: { type: "counter", field: "messagesSent", target: 100 } },
    { key: "messages_1000", name: "No Life", description: "Send 1,000 messages", icon: "📱", category: "social", conditions: { type: "counter", field: "messagesSent", target: 1000 } },
];

// In-memory counter store (per guild:userId)
const counters = new Map();

function counterKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

export class AchievementService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async ensureDefinitions(guildId) {
        for (const def of BUILTIN_ACHIEVEMENTS) {
            await this.prisma.achievement.upsert({
                where: { guildId_key: { guildId, key: def.key } },
                create: { guildId, ...def, conditions: JSON.stringify(def.conditions) },
                update: {},
            });
        }
    }

    async increment(guildId, userId, field, amount = 1) {
        const key = counterKey(guildId, userId);
        const current = counters.get(key) ?? {};
        current[field] = (current[field] ?? 0) + amount;
        counters.set(key, current);

        // Check achievements after increment
        await this.checkAll(guildId, userId);
    }

    async setCounter(guildId, userId, field, value) {
        const key = counterKey(guildId, userId);
        const current = counters.get(key) ?? {};
        current[field] = value;
        counters.set(key, current);
        await this.checkAll(guildId, userId);
    }

    async getCounter(guildId, userId, field) {
        const key = counterKey(guildId, userId);
        const current = counters.get(key) ?? {};
        return current[field] ?? 0;
    }

    async checkAll(guildId, userId) {
        await this.ensureDefinitions(guildId);

        const achievements = await this.prisma.achievement.findMany({ where: { guildId } });
        const eco = await this.client.services.economy?.getProfile(guildId, userId);
        const xp = await this.client.services.leveling?.getRank(guildId, userId);
        const key = counterKey(guildId, userId);
        const ctrs = counters.get(key) ?? {};

        for (const ach of achievements) {
            const conditions = JSON.parse(ach.conditions || "{}");
            let progress = 0;
            let unlocked = false;

            if (conditions.type === "counter") {
                progress = Math.min(ctrs[conditions.field] ?? 0, conditions.target);
                unlocked = progress >= conditions.target;
            } else if (conditions.type === "totalEarned") {
                progress = Math.min(eco?.totalEarned ?? 0, conditions.target);
                unlocked = (eco?.totalEarned ?? 0) >= conditions.target;
            } else if (conditions.type === "streak") {
                progress = Math.min(eco?.[conditions.field] ?? 0, conditions.target);
                unlocked = (eco?.[conditions.field] ?? 0) >= conditions.target;
            } else if (conditions.type === "level") {
                progress = Math.min(xp?.level ?? 0, conditions.target);
                unlocked = (xp?.level ?? 0) >= conditions.target;
            }

            const existing = await this.prisma.userAchievement.findUnique({
                where: { guildId_userId_achievementId: { guildId, userId, achievementId: ach.id } },
            });

            if (existing) {
                if (!existing.unlocked && unlocked) {
                    await this.prisma.userAchievement.update({
                        where: { id: existing.id },
                        data: { unlocked: true, unlockedAt: new Date(), progress },
                    });
                    await this.notifyUnlock(guildId, userId, ach);
                } else if (!existing.unlocked) {
                    await this.prisma.userAchievement.update({
                        where: { id: existing.id },
                        data: { progress },
                    });
                }
            } else {
                await this.prisma.userAchievement.create({
                    data: { guildId, userId, achievementId: ach.id, progress, unlocked },
                });
                if (unlocked) await this.notifyUnlock(guildId, userId, ach);
            }
        }
    }

    async notifyUnlock(guildId, userId, achievement) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        // Try to send to announce channel, fallback to DM
        const config = await this.client.services.settings?.get(guildId);
        const ch = guild.channels.cache.get(config?.welcomeChannelId);
        if (ch?.isTextBased()) {
            await ch.send({
                content: `${member} unlocked an achievement: **${achievement.icon ?? ""} ${achievement.name}** — ${achievement.description ?? ""}`,
            }).catch(() => {});
        }
    }

    async getUnlocked(guildId, userId) {
        return this.prisma.userAchievement.findMany({
            where: { guildId, userId, unlocked: true },
            include: { achievement: true },
        });
    }

    async getAll(guildId, userId) {
        const achievements = await this.prisma.achievement.findMany({ where: { guildId }, orderBy: { category: "asc" } });
        const user = await this.prisma.userAchievement.findMany({ where: { guildId, userId } });
        const userMap = Object.fromEntries(user.map(u => [u.achievementId, u]));

        return achievements.map(a => ({
            ...a,
            conditions: JSON.parse(a.conditions || "{}"),
            userProgress: userMap[a.id]?.progress ?? 0,
            unlocked: userMap[a.id]?.unlocked ?? false,
        }));
    }

    async getStats(guildId) {
        const total = await this.prisma.achievement.count({ where: { guildId } });
        const unlocked = await this.prisma.userAchievement.count({ where: { guildId, unlocked: true } });
        return { total, unlocked };
    }
}
