import { eq, and } from "drizzle-orm";
import { ticket, ticketType } from "../../../db/schema/index.js";
import { one } from "../../../db/util.js";
import { logger } from "../../../core/logger.js";

// Ownership enforcement for guild-scoped resources. Every ticket/type
// lookup is checked against the session guild: 404 when missing,
// 403 when it belongs to another guild. Returns the record or sends
// the error response and returns null.
export async function ownedTicket(db, req, res, ticketId) {
    const t = one(await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1));
    if (!t) { res.status(404).json({ error: "Ticket not found." }); return null; }
    if (t.guildId !== req.guildId) {
        logger.info("auth", `ticket access denied: user ${req.userId} guild ${req.guildId} != ticket ${ticketId} guild ${t.guildId}`);
        res.status(403).json({ error: "Access denied to this ticket." });
        return null;
    }
    return t;
}

export async function ownedType(db, req, res, typeId) {
    const type = one(await db.select().from(ticketType).where(eq(ticketType.id, typeId)).limit(1));
    if (!type) { res.status(404).json({ error: "Ticket type not found." }); return null; }
    if (type.guildId !== req.guildId) {
        logger.info("auth", `type access denied: user ${req.userId} guild ${req.guildId} != type ${typeId} guild ${type.guildId}`);
        res.status(403).json({ error: "Access denied." });
        return null;
    }
    return type;
}

// Discord permission bits: ADMINISTRATOR (0x8) | MANAGE_GUILD (0x20).
const MANAGE_BITS = 0x28n;

export function guildManageable(g) {
    if (!g || typeof g.id !== "string") return false;
    if (g.owner === true) return true;
    try {
        return (BigInt(g.permissions ?? "0") & MANAGE_BITS) !== 0n;
    } catch { return false; }
}

export function botInGuild(guildId) {
    try {
        return !!globalThis._client?.guilds?.cache?.has(guildId);
    } catch { return false; }
}
