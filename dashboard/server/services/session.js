import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { session } from "../../../db/schema/index.js";
import { one } from "../../../db/util.js";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId, guildId) {
    const db = getDb();
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.insert(session).values({ tokenHash, userId, guildId, expiresAt });
    return { token, expiresAt };
}

export async function validateSession(token) {
    const db = getDb();
    const tokenHash = hashToken(token);
    const row = one(await db.select().from(session).where(eq(session.tokenHash, tokenHash)).limit(1));
    if (!row || Date.now() > row.expiresAt.getTime()) {
        if (row && Date.now() > row.expiresAt.getTime()) {
            await db.delete(session).where(eq(session.id, row.id)).catch(() => {});
        }
        return null;
    }
    return row;
}

export async function deleteSessionByToken(token) {
    const db = getDb();
    await db.delete(session).where(eq(session.tokenHash, hashToken(token))).catch(() => {});
}

export function getSessionDb() {
    return getDb();
}
