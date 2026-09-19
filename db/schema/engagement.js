// Engagement tables: polls, reminders, suggestions, starboard,
// reaction roles, giveaways, achievements. Mirrors Prisma models 1:1.
import { mysqlTable, varchar, text, int, boolean, primaryKey, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { uuidPk, str191, txt, txtDef, createdAt, updatedAt, ts } from "./_common.js";

export const poll = mysqlTable("Poll", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    messageId: varchar("messageId", { length: 191 }).notNull().unique(),
    authorId: text("authorId").notNull(),
    question: text("question").notNull(),
    options: text("options").notNull(),
    endsAt: ts("endsAt"),
    createdAt: createdAt(),
});

export const reminder = mysqlTable("Reminder", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    userId: text("userId").notNull(),
    message: text("message").notNull(),
    remindAt: ts("remindAt").notNull(),
    createdAt: createdAt(),
}, (t) => [
    index("reminder_at").on(t.remindAt),
]);

export const suggestion = mysqlTable("Suggestion", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    messageId: varchar("messageId", { length: 191 }).notNull().unique(),
    authorId: text("authorId").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().$defaultFn(() => "PENDING"),
    reviewerId: txt("reviewerId"),
    reviewNote: txt("reviewNote"),
    createdAt: createdAt(),
}, (t) => [
    index("suggestion_guild_status").on(t.guildId, t.status),
]);

export const starboardConfig = mysqlTable("StarboardConfig", {
    guildId: str191("guildId").primaryKey(),
    channelId: text("channelId").notNull(),
    threshold: int("threshold").notNull().default(3),
    emoji: text("emoji").notNull().$defaultFn(() => "⭐"),
});

export const starboardEntry = mysqlTable("StarboardEntry", {
    id: int("id").primaryKey().autoincrement(),
    guildId: str191("guildId").notNull(),
    originalId: str191("originalId").notNull(),
    starboardId: text("starboardId").notNull(),
    starCount: int("starCount").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    uniqueIndex("starentry_guild_orig").on(t.guildId, t.originalId),
]);

export const reactionRole = mysqlTable("ReactionRole", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    messageId: str191("messageId").notNull(),
    emoji: str191("emoji").notNull(),
    roleId: text("roleId").notNull(),
}, (t) => [
    uniqueIndex("rr_guild_msg_emoji").on(t.guildId, t.messageId, t.emoji),
    index("rr_guild").on(t.guildId),
]);

export const giveaway = mysqlTable("Giveaway", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    messageId: varchar("messageId", { length: 191 }).notNull().unique(),
    hostId: txt("hostId"),
    hostTag: txt("hostTag"),
    prize: text("prize").notNull(),
    winners: int("winners").notNull().default(1),
    endsAt: ts("endsAt").notNull(),
    ended: boolean("ended").notNull().default(false),
    status: text("status").notNull().$defaultFn(() => "ACTIVE"),
    winnerIds: txtDef("winnerIds", "[]"),
    entryCount: int("entryCount").notNull().default(0),
    createdAt: createdAt(),
}, (t) => [
    index("giveaway_ends").on(t.endsAt),
    index("giveaway_guild_status").on(t.guildId, t.status),
]);

export const giveawayEntry = mysqlTable("GiveawayEntry", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    giveawayId: str191("giveawayId").notNull(),
    userId: str191("userId").notNull(),
    enteredAt: createdAt("enteredAt"),
}, (t) => [
    uniqueIndex("giveentry_give_user").on(t.giveawayId, t.userId),
    index("giveentry_guild").on(t.guildId),
    index("giveentry_give").on(t.giveawayId),
]);

export const achievement = mysqlTable("Achievement", {
    id: uuidPk(),
    guildId: txt("guildId"),
    key: str191("key").notNull(),
    name: text("name").notNull(),
    description: txt("description"),
    category: text("category").notNull().$defaultFn(() => "general"),
    icon: txt("icon"),
    rewards: txtDef("rewards", "{}"),
    conditions: txtDef("conditions", "{}"),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex("achieve_guild_key").on(t.guildId, t.key),
    index("achieve_guild").on(t.guildId),
]);

export const userAchievement = mysqlTable("UserAchievement", {
    guildId: str191("guildId").notNull(),
    userId: str191("userId").notNull(),
    achievementId: str191("achievementId").notNull(),
    progress: int("progress").notNull().default(0),
    unlocked: boolean("unlocked").notNull().default(false),
    unlockedAt: ts("unlockedAt"),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.guildId, t.userId, t.achievementId] }),
    index("userachieve_guild_user").on(t.guildId, t.userId),
]);
