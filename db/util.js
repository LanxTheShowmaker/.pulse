// Small helpers that reproduce Prisma conveniences on top of drizzle:
// - undefined means "absent" (never sent to MySQL as NULL)
// - single-row reads normalize to `row ?? null`
// - write results normalize to affected-row counts
import { randomUUID } from "node:crypto";

export function clean(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        if (v !== undefined) out[k] = v;
    }
    return out;
}

export function one(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] ?? null;
}

export function affected(res) {
    if (!res) return 0;
    const r = Array.isArray(res) ? res[0] : res;
    const n = r?.affectedRows ?? r?.changes ?? 0;
    return Number(n) || 0;
}

// Normalize a raw drizzle/mysql2 execute() result to a rows array
// regardless of driver result shape.
export async function selectRows(promise) {
    const res = await promise;
    if (Array.isArray(res)) {
        if (res.length === 0) return [];
        // mysql2 returns [rows, fields]; drizzle may return rows directly.
        if (Array.isArray(res[0])) return res[0];
        if (res[0] && typeof res[0] === "object" && !Buffer.isBuffer(res[0])) return res;
    }
    return [];
}

export function uuid() {
    return randomUUID();
}
