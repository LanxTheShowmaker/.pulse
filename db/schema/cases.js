// Moderation case tracking. Mirrors the Prisma models 1:1.
import { mysqlTable, text, int, bigint, boolean, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { uuidPk, str191, txt, txtDef, createdAt, updatedAt, ts } from "./_common.js";

export const case_ = mysqlTable("Case", {
    id: int("id").primaryKey().autoincrement(),
    guildId: str191("guildId").notNull(),
    caseNumber: int("caseNumber").notNull(),
    targetId: str191("targetId").notNull(),
    targetTag: text("targetTag").notNull(),
    moderatorId: text("moderatorId").notNull(),
    moderatorTag: text("moderatorTag").notNull(),
    action: text("action").notNull(),
    reason: txt("reason"),
    duration: txt("duration"),
    durationMs: bigint("durationMs", { mode: "number" }),
    resolved: boolean("resolved").notNull().default(false),
    resolvedById: txt("resolvedById"),
    resolvedByTag: txt("resolvedByTag"),
    resolvedAt: ts("resolvedAt"),
    metadata: txt("metadata"),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex("case_guild_number").on(t.guildId, t.caseNumber),
    index("case_guild_target").on(t.guildId, t.targetId),
]);

export const caseNote = mysqlTable("CaseNote", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    caseNumber: int("caseNumber"),
    targetId: str191("targetId").notNull(),
    authorId: text("authorId").notNull(),
    authorTag: txt("authorTag"),
    content: text("content").notNull(),
    createdAt: createdAt(),
}, (t) => [
    index("casenote_guild_target").on(t.guildId, t.targetId),
    index("casenote_guild_case").on(t.guildId, t.caseNumber),
]);

export const appeal = mysqlTable("Appeal", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    caseNumber: int("caseNumber").notNull(),
    appellantId: text("appellantId").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().$defaultFn(() => "PENDING"),
    reviewerId: txt("reviewerId"),
    reviewerTag: txt("reviewerTag"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    index("appeal_guild_status").on(t.guildId, t.status),
]);

export const auditLog = mysqlTable("AuditLog", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    actorId: txt("actorId"),
    targetId: txt("targetId"),
    action: text("action").notNull(),
    category: str191("category").notNull(),
    details: txt("details"),
    createdAt: createdAt(),
}, (t) => [
    index("audit_guild_created").on(t.guildId, t.createdAt),
    index("audit_guild_category").on(t.guildId, t.category),
]);

export const raidIncident = mysqlTable("RaidIncident", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    type: text("type").notNull(),
    risk: int("risk").notNull(),
    details: txt("details"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: createdAt(),
}, (t) => [
    index("raid_guild_created").on(t.guildId, t.createdAt),
]);

// NOTE: the table is named "Case" (reserved word in MySQL) — drizzle
// always quotes identifiers, so this is safe.
