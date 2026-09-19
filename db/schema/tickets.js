// Ticket system tables. Mirrors the Prisma models 1:1. Ticket->TicketType
// is resolved in code via typeId (no relation exists in the source schema,
// so no foreign key is invented here).
import { mysqlTable, varchar, text, int, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { uuidPk, str191, txt, txtDef, createdAt, updatedAt, ts } from "./_common.js";

export const ticketType = mysqlTable("TicketType", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    panelType: text("panelType").notNull(),
    key: str191("key").notNull(),
    displayName: text("displayName").notNull(),
    description: txt("description"),
    emoji: txt("emoji"),
    enabled: boolean("enabled").notNull().default(true),
    categoryId: txt("categoryId"),
    staffRoleIds: txtDef("staffRoleIds", "[]"),
    moderatorRoleIds: txtDef("moderatorRoleIds", "[]"),
    channelPrefix: txt("channelPrefix").$defaultFn(() => "ticket"),
    welcomeMessage: txt("welcomeMessage"),
    instructions: txt("instructions"),
    bannerUrl: txt("bannerUrl"),
    priority: text("priority").notNull().$defaultFn(() => "NORMAL"),
    cooldown: int("cooldown").notNull().default(0),
    maxOpen: int("maxOpen").notNull().default(1),
    allowClaim: boolean("allowClaim").notNull().default(true),
    questions: txtDef("questions", "[]"),
    formQuestions: txtDef("formQuestions", "[]"),
    autoCloseMinutes: int("autoCloseMinutes").notNull().default(30),
}, (t) => [
    uniqueIndex("tickettype_guild_key").on(t.guildId, t.key),
    index("tickettype_guild_panel").on(t.guildId, t.panelType),
]);

export const ticket = mysqlTable("Ticket", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: varchar("channelId", { length: 191 }).notNull().unique(),
    openerId: str191("openerId").notNull(),
    typeId: txt("typeId"),
    panelType: txt("panelType"),
    status: text("status").notNull().$defaultFn(() => "OPEN"),
    priority: text("priority").notNull().$defaultFn(() => "NORMAL"),
    customName: txt("customName"),
    claimedById: txt("claimedById"),
    assignedById: txt("assignedById"),
    assignedAt: ts("assignedAt"),
    closedById: txt("closedById"),
    closeReason: txt("closeReason"),
    lastMessageAt: ts("lastMessageAt"),
    workspaceMessageId: txt("workspaceMessageId"),
    createdAt: createdAt(),
    closedAt: ts("closedAt"),
    transcript: txt("transcript"),
}, (t) => [
    index("ticket_guild_opener").on(t.guildId, t.openerId),
    index("ticket_guild_status").on(t.guildId, t.status),
    index("ticket_guild_closed").on(t.guildId, t.closedAt),
]);

export const ticketNote = mysqlTable("TicketNote", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    ticketId: str191("ticketId").notNull(),
    authorId: text("authorId").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
}, (t) => [
    index("ticketnote_guild_ticket").on(t.guildId, t.ticketId),
    index("ticketnote_guild").on(t.guildId),
]);

export const ticketHistory = mysqlTable("TicketHistory", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    ticketId: str191("ticketId").notNull(),
    event: str191("event").notNull(),
    actorId: txt("actorId"),
    details: txt("details"),
    createdAt: createdAt(),
}, (t) => [
    index("tickethist_guild_ticket").on(t.guildId, t.ticketId),
    index("tickethist_guild_event").on(t.guildId, t.event),
]);

export const ticketFormResponse = mysqlTable("TicketFormResponse", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    ticketId: str191("ticketId").notNull(),
    questions: text("questions").notNull(),
    answers: text("answers").notNull(),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex("ticketform_guild_ticket").on(t.guildId, t.ticketId),
    index("ticketform_guild").on(t.guildId),
]);

export const ticketRating = mysqlTable("TicketRating", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: str191("channelId").notNull(),
    raterId: str191("raterId").notNull(),
    rating: int("rating").notNull(),
    feedback: txt("feedback"),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex("ticketrating_guild_chan_rater").on(t.guildId, t.channelId, t.raterId),
    index("ticketrating_guild").on(t.guildId),
]);

// Legacy API-boundary snapshot tables (unused by current code, kept for
// schema fidelity so no data is lost).
export const ticketSummary = mysqlTable("TicketSummary", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    type: txt("type"),
    status: text("status").notNull(),
    priority: text("priority").notNull(),
    openedBy: text("openedBy").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", fsp: 3 }).notNull(),
    closedAt: ts("closedAt"),
});

export const ticketDetail = mysqlTable("TicketDetail", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: text("channelId").notNull(),
    typeId: txt("typeId"),
    openerId: text("openerId").notNull(),
    claimedById: txt("claimedById"),
    assignedById: txt("assignedById"),
    status: text("status").notNull(),
    priority: text("priority").notNull(),
    closeReason: txt("closeReason"),
    createdAt: timestamp("createdAt", { mode: "date", fsp: 3 }).notNull(),
    closedAt: ts("closedAt"),
    transcript: txt("transcript"),
    formAnswers: txt("formAnswers"),
    notes: txt("notes"),
    history: txt("history"),
});

export const panel = mysqlTable("Panel", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    panelType: str191("panelType").notNull(),
    channelId: txt("channelId"),
    messageId: txt("messageId"),
    title: txt("title"),
    description: txt("description"),
    bannerUrl: txt("bannerUrl"),
    bannerChannelId: txt("bannerChannelId"),
    bannerMessageId: txt("bannerMessageId"),
    thumbnailUrl: txt("thumbnailUrl"),
    embedColor: int("embedColor"),
    footerText: txt("footerText"),
    footerIcon: txt("footerIcon"),
    enabled: boolean("enabled").notNull().default(false),
    config: txtDef("config", "{}"),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex("panel_guild_type").on(t.guildId, t.panelType),
    index("panel_guild").on(t.guildId),
]);

export const order = mysqlTable("Order", {
    id: uuidPk(),
    guildId: str191("guildId").notNull(),
    channelId: varchar("channelId", { length: 191 }).notNull().unique(),
    openerId: text("openerId").notNull(),
    claimedById: txt("claimedById"),
    category: text("category").notNull(),
    status: text("status").notNull().$defaultFn(() => "BRIEF"),
    brief: txt("brief"),
    budget: txt("budget"),
    deadline: ts("deadline"),
    references: txt("references"),
    createdAt: createdAt(),
    closedAt: ts("closedAt"),
    transcript: txt("transcript"),
}, (t) => [
    index("order_guild_status").on(t.guildId, t.status),
]);
