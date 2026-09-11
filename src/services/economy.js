import { logger } from "../core/logger.js";

const COOLDOWNS = {
    daily:  86_400_000,
    weekly: 604_800_000,
    work:   1_800_000,
    crime:  1_800_000,
    rob:    3_600_000,
};

const WORK_JOBS = [
    { job: "Software Developer", min: 150, max: 300, emoji: "💻" },
    { job: "Pizza Delivery", min: 50, max: 120, emoji: "🍕" },
    { job: "Freelance Designer", min: 100, max: 250, emoji: "🎨" },
    { job: "Dog Walker", min: 30, max: 80, emoji: "🐕" },
    { job: "Streamer", min: 20, max: 400, emoji: "📺" },
    { job: "Mechanic", min: 80, max: 200, emoji: "🔧" },
    { job: "Chef", min: 70, max: 180, emoji: "👨‍🍳" },
    { job: "Uber Driver", min: 60, max: 150, emoji: "🚗" },
    { job: "Musician", min: 40, max: 300, emoji: "🎵" },
    { job: "Gamer", min: 10, max: 500, emoji: "🎮" },
    { job: "Teacher", min: 80, max: 160, emoji: "📚" },
    { job: "Construction Worker", min: 100, max: 220, emoji: "🏗️" },
];

const CRIME_OPTIONS = [
    { crime: "Robbed a bank", successReward: 500, failLoss: 200, successChance: 0.4, emoji: "🏦" },
    { crime: "Stole a car", successReward: 300, failLoss: 150, successChance: 0.5, emoji: "🚗" },
    { crime: "Pickpocketed someone", successReward: 150, failLoss: 75, successChance: 0.6, emoji: "👤" },
    { crime: "Hacked a wallet", successReward: 400, failLoss: 250, successChance: 0.35, emoji: "💻" },
    { crime: "Sold fake art", successReward: 250, failLoss: 100, successChance: 0.55, emoji: "🖼️" },
    { crime: "Broke into a warehouse", successReward: 350, failLoss: 180, successChance: 0.45, emoji: "📦" },
    { crime: "Counterfeited coins", successReward: 600, failLoss: 300, successChance: 0.3, emoji: "🪙" },
];

const SLOT_SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣", "🔔"];
const SLOT_WEIGHTS = [30, 25, 20, 15, 7, 2, 1];

function weightedRandom() {
    const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
        r -= SLOT_WEIGHTS[i];
        if (r <= 0) return SLOT_SYMBOLS[i];
    }
    return SLOT_SYMBOLS[0];
}

function formatMs(ms) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export class EconomyService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    // ── Core ──

    async getProfile(guildId, userId) {
        return this.prisma.economy.findUnique({ where: { guildId_userId: { guildId, userId } } });
    }

    async getOrCreate(guildId, userId) {
        return this.prisma.economy.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId },
            update: {},
        });
    }

    async getBalance(guildId, userId) {
        const eco = await this.getProfile(guildId, userId);
        return { wallet: eco?.balance ?? 0, bank: eco?.bank ?? 0, total: (eco?.balance ?? 0) + (eco?.bank ?? 0) };
    }

    async addCoins(guildId, userId, amount, type, meta) {
        const eco = await this.prisma.economy.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, balance: Math.max(0, amount), totalEarned: Math.max(0, amount) },
            update: {
                balance: { increment: amount },
                totalEarned: amount > 0 ? { increment: amount } : undefined,
                totalSpent: amount < 0 ? { increment: Math.abs(amount) } : undefined,
            },
        });

        await this.prisma.economyTransaction.create({
            data: { guildId, userId, type, amount, balanceAfter: eco.balance, meta: meta ? JSON.stringify(meta) : null },
        }).catch(() => {});

        return eco.balance;
    }

    async setBalance(guildId, userId, amount) {
        return this.prisma.economy.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, balance: amount },
            update: { balance: amount },
        });
    }

    async resetUser(guildId, userId) {
        return this.prisma.economy.deleteMany({ where: { guildId, userId } });
    }

    // ── Cooldowns ──

    canDo(profile, field, cooldownMs) {
        if (!profile?.[field]) return { ok: true, remaining: 0 };
        const elapsed = Date.now() - new Date(profile[field]).getTime();
        if (elapsed >= cooldownMs) return { ok: true, remaining: 0 };
        return { ok: false, remaining: cooldownMs - elapsed };
    }

    async markUsed(guildId, userId, field) {
        await this.prisma.economy.update({
            where: { guildId_userId: { guildId, userId } },
            update: { [field]: new Date() },
        }).catch(() => {});
    }

    // ── Daily / Weekly ──

    async claimDaily(guildId, userId) {
        const eco = await this.getOrCreate(guildId, userId);
        const check = this.canDo(eco, "lastDaily", COOLDOWNS.daily);
        if (!check.ok) return { ok: false, remaining: check.remaining };

        const streak = eco.lastDaily && (Date.now() - new Date(eco.lastDaily).getTime() < 172_800_000)
            ? eco.dailyStreak + 1 : 1;
        const base = 100;
        const bonus = Math.min(streak, 30) * 10;
        const amount = base + bonus;

        await this.prisma.economy.update({
            where: { guildId_userId: { guildId, userId } },
            update: { lastDaily: new Date(), dailyStreak: streak },
        });
        const balance = await this.addCoins(guildId, userId, amount, "daily", { streak });
        return { ok: true, amount, balance, streak };
    }

    async claimWeekly(guildId, userId) {
        const eco = await this.getOrCreate(guildId, userId);
        const check = this.canDo(eco, "lastWeekly", COOLDOWNS.weekly);
        if (!check.ok) return { ok: false, remaining: check.remaining };

        const streak = eco.lastWeekly && (Date.now() - new Date(eco.lastWeekly).getTime() < 1_209_600_000)
            ? eco.weeklyStreak + 1 : 1;
        const base = 500;
        const bonus = Math.min(streak, 12) * 50;
        const amount = base + bonus;

        await this.prisma.economy.update({
            where: { guildId_userId: { guildId, userId } },
            update: { lastWeekly: new Date(), weeklyStreak: streak },
        });
        const balance = await this.addCoins(guildId, userId, amount, "weekly", { streak });
        return { ok: true, amount, balance, streak };
    }

    // ── Work ──

    async work(guildId, userId) {
        const eco = await this.getOrCreate(guildId, userId);
        const check = this.canDo(eco, "lastWork", COOLDOWNS.work);
        if (!check.ok) return { ok: false, remaining: check.remaining };

        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
        const amount = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

        await this.markUsed(guildId, userId, "lastWork");
        const balance = await this.addCoins(guildId, userId, amount, "work", { job: job.job });
        return { ok: true, amount, balance, job };
    }

    // ── Crime ──

    async crime(guildId, userId) {
        const eco = await this.getOrCreate(guildId, userId);
        const check = this.canDo(eco, "lastCrime", COOLDOWNS.crime);
        if (!check.ok) return { ok: false, remaining: check.remaining };

        const option = CRIME_OPTIONS[Math.floor(Math.random() * CRIME_OPTIONS.length)];
        const success = Math.random() < option.successChance;

        await this.prisma.economy.update({
            where: { guildId_userId: { guildId, userId } },
            update: {
                lastCrime: new Date(),
                crimesCommitted: { increment: 1 },
                crimesFailed: success ? undefined : { increment: 1 },
            },
        });

        if (success) {
            const balance = await this.addCoins(guildId, userId, option.successReward, "crime_success", { crime: option.crime });
            return { ok: true, success: true, amount: option.successReward, balance, crime: option };
        } else {
            const loss = Math.min(option.failLoss, eco.balance);
            const balance = await this.addCoins(guildId, userId, -loss, "crime_fail", { crime: option.crime });
            return { ok: true, success: false, amount: loss, balance, crime: option };
        }
    }

    // ── Rob ──

    async rob(guildId, robberId, victimId) {
        if (robberId === victimId) return { ok: false, error: "You can't rob yourself." };

        const [robber, victim] = await Promise.all([
            this.getOrCreate(guildId, robberId),
            this.getOrCreate(guildId, victimId),
        ]);

        const robberCheck = this.canDo(robber, "lastRob", COOLDOWNS.rob);
        if (!robberCheck.ok) return { ok: false, remaining: robberCheck.remaining };

        if (victim.balance < 50) return { ok: false, error: "Target is too poor to rob." };

        const stealPercent = 0.2 + Math.random() * 0.3; // 20-50%
        const stolen = Math.floor(victim.balance * stealPercent);
        const caught = Math.random() < 0.35; // 35% chance to get caught

        await this.markUsed(guildId, robberId, "lastRob");

        if (caught) {
            const fine = Math.floor(stolen * 0.5);
            await this.addCoins(guildId, robberId, -fine, "rob_caught", { victim: victimId });
            return { ok: true, caught: true, amount: fine, victim: victimId };
        }

        await this.prisma.$transaction([
            this.prisma.economy.update({
                where: { guildId_userId: { guildId, userId: robberId } },
                data: { balance: { increment: stolen }, timesRobbed: { increment: 1 } },
            }),
            this.prisma.economy.update({
                where: { guildId_userId: { guildId, userId: victimId } },
                data: { balance: { decrement: stolen } },
            }),
        ]);

        const balance = robber.balance + stolen;
        return { ok: true, caught: false, amount: stolen, balance, victim: victimId };
    }

    // ── Slots ──

    async slots(guildId, userId, bet) {
        const eco = await this.getOrCreate(guildId, userId);
        if (eco.balance < bet) return { ok: false, error: "Insufficient wallet balance." };

        const r1 = weightedRandom();
        const r2 = weightedRandom();
        const r3 = weightedRandom();

        let multiplier = 0;
        if (r1 === r2 && r2 === r3) {
            multiplier = r1 === "7️⃣" ? 10 : r1 === "💎" ? 7 : 5;
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            multiplier = 2;
        }

        const winAmount = bet * multiplier;
        const net = winAmount - bet;

        await this.prisma.economy.update({
            where: { guildId_userId: { guildId, userId } },
            update: { slotsPlayed: { increment: 1 }, slotsWon: multiplier > 0 ? { increment: 1 } : undefined },
        });

        const balance = await this.addCoins(guildId, userId, net, "slots", { reels: [r1, r2, r3], bet, win: winAmount });
        return { ok: true, reels: [r1, r2, r3], multiplier, winAmount, net, balance };
    }

    // ── Bank ──

    async deposit(guildId, userId, amount) {
        const eco = await this.getOrCreate(guildId, userId);
        if (amount <= 0) return { ok: false, error: "Amount must be positive." };
        if (eco.balance < amount) return { ok: false, error: "Insufficient wallet balance." };

        await this.prisma.$transaction([
            this.prisma.economy.update({ where: { guildId_userId: { guildId, userId } }, data: { balance: { decrement: amount }, bank: { increment: amount } } }),
        ]);

        return { ok: true, wallet: eco.balance - amount, bank: eco.bank + amount };
    }

    async withdraw(guildId, userId, amount) {
        const eco = await this.getOrCreate(guildId, userId);
        if (amount <= 0) return { ok: false, error: "Amount must be positive." };
        if (eco.bank < amount) return { ok: false, error: "Insufficient bank balance." };

        await this.prisma.$transaction([
            this.prisma.economy.update({ where: { guildId_userId: { guildId, userId } }, data: { bank: { decrement: amount }, balance: { increment: amount } } }),
        ]);

        return { ok: true, wallet: eco.balance + amount, bank: eco.bank - amount };
    }

    // ── Gift ──

    async gift(guildId, fromId, toId, amount) {
        if (amount <= 0) return { ok: false, error: "Amount must be positive." };

        const result = await this.prisma.$transaction(async (tx) => {
            const sender = await tx.economy.findUnique({ where: { guildId_userId: { guildId, userId: fromId } } });
            if ((sender?.balance ?? 0) < amount) throw new Error("Insufficient balance");

            await tx.economy.update({ where: { guildId_userId: { guildId, userId: fromId } }, data: { balance: { decrement: amount } } });
            await tx.economy.upsert({
                where: { guildId_userId: { guildId, userId: toId } },
                create: { guildId, userId: toId, balance: amount },
                update: { balance: { increment: amount } },
            });
            return true;
        }).catch(() => false);

        if (!result) return { ok: false, error: "Insufficient balance." };
        return { ok: true };
    }

    // ── Leaderboard / History ──

    async getLeaderboard(guildId, limit = 10) {
        return this.prisma.economy.findMany({
            where: { guildId },
            orderBy: [{ bank: "desc" }, { balance: "desc" }],
            take: limit,
        });
    }

    async getHistory(guildId, userId, limit = 15) {
        return this.prisma.economyTransaction.findMany({
            where: { guildId, userId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    // ── Admin ──

    async adminGive(guildId, userId, amount, adminId) {
        const balance = await this.addCoins(guildId, userId, amount, "admin_give", { admin: adminId });
        return { ok: true, balance };
    }

    async adminTake(guildId, userId, amount, adminId) {
        const eco = await this.getOrCreate(guildId, userId);
        const take = Math.min(amount, eco.balance);
        const balance = await this.addCoins(guildId, userId, -take, "admin_take", { admin: adminId });
        return { ok: true, balance, taken: take };
    }

    async adminSet(guildId, userId, amount) {
        await this.setBalance(guildId, userId, amount);
        return { ok: true };
    }
}

export { COOLDOWNS, WORK_JOBS, CRIME_OPTIONS, SLOT_SYMBOLS, formatMs };
