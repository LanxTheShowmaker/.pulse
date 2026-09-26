// Single MySQL layer for bot + dashboard (drizzle-orm + mysql2).
// DATABASE_URL is a MySQL connection URL, e.g.
//   mysql://user:password@localhost:3306/pulse
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { logger } from "../core/logger.js";
import * as schema from "./schema/index.js";

let pool = null;
let db = null;

export function getPool() {
    if (!pool) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL missing");
        pool = mysql.createPool({
            uri: url,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10_000,
            timezone: "+00:00",
            dateStrings: false,
        });
        db = drizzle(pool, { schema, mode: "default" });
    }
    return pool;
}

export function getDb() {
    getPool();
    return db;
}

// Verify connectivity with a trivial query. Throws on failure.
export async function verifyDatabase() {
    getPool();
    try {
        await db.execute(sql`SELECT 1`);
    } catch (e) {
        const hint = describeDatabaseUrl(process.env.DATABASE_URL);
        const code = e?.code ? ` (${e.code})` : "";
        throw new Error(`MySQL connection failed${code} [${hint}]: ${e?.message ?? e}. Is MySQL running and does the database exist?`);
    }
}

function describeDatabaseUrl(url) {
    try {
        const u = new URL((url ?? "").replace(/^"|"$/g, ""));
        return `${u.username || "(no user)"}@${u.hostname || "?"}:${u.port || "3306"}${u.pathname || ""}`;
    } catch {
        return "(unparseable DATABASE_URL)";
    }
}

export { schema };
export { sql } from "drizzle-orm";
export { selectRows } from "./util.js";

// Idempotent migrate runner lives in ./migrate.js.
export async function closeDatabase() {
    if (pool) {
        await pool.end().catch(() => {});
        pool = null;
        db = null;
    }
}
