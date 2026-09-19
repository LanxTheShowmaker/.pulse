import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Read-only live data from the running Discord client cache.
// Anything unknown is reported as unknown — never fabricated.
export function getGuildInfo(gid) {
    try {
        const client = globalThis._client;
        const g = client?.guilds?.cache?.get(gid);
        if (!g) return null;
        return {
            id: g.id,
            name: g.name || null,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            memberCount: typeof g.memberCount === "number" ? g.memberCount : null,
        };
    } catch { return null; }
}

export async function getBotStatus() {
    let dbOk = false;
    try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch { dbOk = false; }
    try {
        const client = globalThis._client;
        if (!client || !client.user) return { online: false, dbOk };
        const ping = client.ws?.ping;
        return {
            online: true,
            tag: client.user.tag || null,
            ping: typeof ping === "number" && ping >= 0 ? ping : null,
            uptimeMs: typeof client.uptime === "number" ? client.uptime : null,
            guilds: typeof client.guilds?.cache?.size === "number" ? client.guilds.cache.size : null,
            dbOk,
        };
    } catch { return { online: false, dbOk }; }
}

export function fmtUptime(ms) {
    if (ms == null || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}
