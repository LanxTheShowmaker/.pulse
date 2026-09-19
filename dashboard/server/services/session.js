import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId, guildId) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.create({ data: { tokenHash, userId, guildId, expiresAt } });
    return { token, expiresAt };
}

export async function validateSession(token) {
    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({ where: { tokenHash } });
    if (!session || Date.now() > session.expiresAt.getTime()) {
        if (session && Date.now() > session.expiresAt.getTime()) {
            await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        }
        return null;
    }
    return session;
}

export async function deleteSessionByToken(token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
}

export function getSessionPrisma() {
    return prisma;
}
