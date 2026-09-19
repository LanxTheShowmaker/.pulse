// Remaining tables: automation, backups, fortress, dashboard sessions.
// Mirrors the Prisma models 1:1.
import { mysqlTable, text, int, boolean, primaryKey, index } from "drizzle-orm/mysql-core";
import { uuidPk, str191, txt, txtDef, createdAt, updatedAt, ts } from "./_common.js";

export const automationRule = mysqlTable("AutomationRule", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    name: txt("name"),
    enabled: boolean("enabled").notNull().default(true),
    trigger: str191("trigger").notNull(),
    conditions: txtDef("conditions", "{}"),
    actions: txtDef("actions", "[]"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    index("autorule_guild_trigger").on(t.guildId, t.trigger),
]);

export const backup = mysqlTable("Backup", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    data: text("data").notNull(),
    version: int("version").notNull().default(1),
    createdById: text("createdById").notNull(),
    createdByTag: txt("createdByTag"),
    createdAt: createdAt(),
}, (t) => [
    index("backup_guild_created").on(t.guildId, t.createdAt),
]);

export const fortressState = mysqlTable("FortressState", {
    guildId: str191("guildId").primaryKey(),
    active: boolean("active").notNull().default(false),
    enabledById: txt("enabledById"),
    enabledByTag: txt("enabledByTag"),
    startedAt: ts("startedAt"),
    snapshot: text("snapshot").notNull(),
});

export const session = mysqlTable("Session", {
    id: uuidPk(),
    tokenHash: str191("tokenHash").notNull().unique(),
    userId: str191("userId").notNull(),
    guildId: txt("guildId"),
    expiresAt: ts("expiresAt").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    index("session_user").on(t.userId),
    index("session_expires").on(t.expiresAt),
]);

export const dashboardGuild = mysqlTable("DashboardGuild", {
    userId: str191("userId").notNull(),
    guildId: str191("guildId").notNull(),
    name: txt("name"),
    icon: txt("icon"),
    permissions: text("permissions").notNull().$defaultFn(() => "0"),
    manage: boolean("manage").notNull().default(false),
    owner: boolean("owner").notNull().default(false),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.userId, t.guildId] }),
    index("dashguild_user").on(t.userId),
]);
