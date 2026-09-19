// Guild-level configuration tables. Mirrors the Prisma models 1:1
// (no relations exist in the source schema, so none are invented here).
import { mysqlTable, boolean, real, int } from "drizzle-orm/mysql-core";
import { strPk, txt, txtDef, createdAt, updatedAt } from "./_common.js";

export const guildConfig = mysqlTable("GuildConfig", {
    guildId: strPk("guildId"),
    logChannelId: txt("logChannelId"),
    modLogChannelId: txt("modLogChannelId"),
    welcomeChannelId: txt("welcomeChannelId"),
    goodbyeChannelId: txt("goodbyeChannelId"),
    ticketCategoryId: txt("ticketCategoryId"),
    ticketLogChannelId: txt("ticketLogChannelId"),
    staffRoleIds: txtDef("staffRoleIds", "[]"),
    moderatorRoleIds: txtDef("moderatorRoleIds", "[]"),
    ignoredChannelIds: txtDef("ignoredChannelIds", "[]"),
    ignoredRoleIds: txtDef("ignoredRoleIds", "[]"),
    ignoredUserIds: txtDef("ignoredUserIds", "[]"),
    modules: txtDef("modules", "{}"),
    automod: txtDef("automod", "{}"),
    orders: txtDef("orders", "{}"),
    prefix: txtDef("prefix", "!"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
});

export const guildBranding = mysqlTable("GuildBranding", {
    guildId: strPk("guildId"),
    displayName: txt("displayName"),
    avatarUrl: txt("avatarUrl"),
    bannerUrl: txt("bannerUrl"),
    nickname: txt("nickname"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
});

export const levelConfig = mysqlTable("LevelConfig", {
    guildId: strPk("guildId"),
    xpMultiplier: real("xpMultiplier").notNull().default(1.0),
    channelMultipliers: txtDef("channelMultipliers", "{}"),
    roleRewards: txtDef("roleRewards", "[]"),
    streakEnabled: boolean("streakEnabled").notNull().default(true),
    announceChannelId: txt("announceChannelId"),
    antiFarmEnabled: boolean("antiFarmEnabled").notNull().default(true),
    prestigeEnabled: boolean("prestigeEnabled").notNull().default(true),
    updatedAt: updatedAt(),
});

export const economyConfig = mysqlTable("EconomyConfig", {
    guildId: strPk("guildId"),
    dailyAmount: int("dailyAmount").notNull().default(100),
    weeklyAmount: int("weeklyAmount").notNull().default(500),
    shopEnabled: boolean("shopEnabled").notNull().default(true),
    tradingEnabled: boolean("tradingEnabled").notNull().default(true),
    jobsEnabled: boolean("jobsEnabled").notNull().default(true),
    updatedAt: updatedAt(),
});
