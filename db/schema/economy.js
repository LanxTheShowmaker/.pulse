// Economy, leveling and presence tables. Mirrors Prisma models 1:1.
import { mysqlTable, text, int, boolean, real, primaryKey, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { uuidPk, str191, txt, txtDef, createdAt, updatedAt, ts } from "./_common.js";

export const xp = mysqlTable("Xp", {
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    xp: int("xp").notNull().default(0),
    level: int("level").notNull().default(0),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    index("xp_guild_level").on(t.guildId, t.level),
]);

export const xpStreak = mysqlTable("XpStreak", {
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    streak: int("streak").notNull().default(0),
    longest: int("longest").notNull().default(0),
    lastXpAt: ts("lastXpAt"),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
]);

export const economy = mysqlTable("Economy", {
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    balance: int("balance").notNull().default(0),
    bank: int("bank").notNull().default(0),
    dailyStreak: int("dailyStreak").notNull().default(0),
    weeklyStreak: int("weeklyStreak").notNull().default(0),
    lastDaily: ts("lastDaily"),
    lastWeekly: ts("lastWeekly"),
    lastWork: ts("lastWork"),
    lastCrime: ts("lastCrime"),
    lastRob: ts("lastRob"),
    totalEarned: int("totalEarned").notNull().default(0),
    totalSpent: int("totalSpent").notNull().default(0),
    crimesCommitted: int("crimesCommitted").notNull().default(0),
    crimesFailed: int("crimesFailed").notNull().default(0),
    timesRobbed: int("timesRobbed").notNull().default(0),
    slotsPlayed: int("slotsPlayed").notNull().default(0),
    slotsWon: int("slotsWon").notNull().default(0),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
]);

export const economyTransaction = mysqlTable("EconomyTransaction", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    type: text("type").notNull(),
    amount: int("amount").notNull(),
    balanceAfter: int("balanceAfter").notNull(),
    meta: txt("meta"),
    createdAt: createdAt(),
}, (t) => [
    index("ecotx_guild_user").on(t.guildId, t.userId),
    index("ecotx_guild_created").on(t.guildId, t.createdAt),
]);

export const shopItem = mysqlTable("ShopItem", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    name: str191("name").notNull(),
    description: txt("description"),
    price: int("price").notNull(),
    roleId: txt("roleId"),
    emoji: txt("emoji"),
    stock: int("stock"),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex("shopitem_guild_name").on(t.guildId, t.name),
    index("shopitem_guild").on(t.guildId),
]);

export const shopInventory = mysqlTable("ShopInventory", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    itemId: str191("itemId").notNull(),
    quantity: int("quantity").notNull().default(1),
    purchasedAt: createdAt("purchasedAt"),
}, (t) => [
    uniqueIndex("shopinv_guild_user_item").on(t.guildId, t.userId, t.itemId),
    index("shopinv_guild_user").on(t.guildId, t.userId),
]);

export const afk = mysqlTable("Afk", {
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    reason: txt("reason"),
    since: createdAt("since"),
}, (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
]);
