// Single MySQL layer for bot + dashboard (drizzle-orm + mysql2).
// DATABASE_URL is a MySQL connection URL, e.g.
//   mysql://user:password@localhost:3306/pulse
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.js";

let pool = null;
let db = null;

export function getPool() {
    if (!pool) {
        const raw = (process.env.DATABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
        if (!raw) throw new Error("DATABASE_URL missing");
        // Validate before handing to the driver: `new URL` alone is too lax
        // ("127.0.0.1:3306" parses as a "127.0.0.1:" scheme), so require an
        // explicit mysql:// scheme and a database name.
        let parsed;
        try {
            parsed = new URL(raw);
        } catch {
            parsed = null;
        }
        if (!parsed || !/^mysql:$/.test(parsed.protocol) || !parsed.pathname.replace(/^\//, "")) {
            throw new Error(
                `DATABASE_URL is not a valid MySQL URL: ${raw}\n`
                + `  ${explainBadUrl(raw)}\n`
                + "  expected format: mysql://user:password@host:port/database\n"
                + "  (quotes around the value are stripped automatically)",
            );
        }
        pool = mysql.createPool({
            uri: raw,
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
        const root = rootCause(e);
        const hint = describeDatabaseUrl(process.env.DATABASE_URL);
        const code = root?.code ? ` [${root.code}]` : "";
        throw new Error(
            `MySQL connection failed${code} ${hint}\n` +
            `  reason: ${root?.message ?? e?.message ?? e}\n` +
            `  ${diagnose(root?.code, root?.sqlState)}`,
        );
    }
}

// Name the specific mistake when we recognise it. The most common one by far
// is a leftover Prisma/SQLite path ("./pulse.db", "file:./dev.db") carried over
// from before the MySQL migration, which otherwise fails as a bare "Invalid URL".
function explainBadUrl(raw) {
    if (/\.(db|sqlite3?)$/i.test(raw) || /^(file:)?\.\.?\//.test(raw)) {
        return 'this looks like the old Prisma/SQLite path. .pulse now requires MySQL — '
            + 'use mysql://user:password@host:port/database';
    }
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(raw)) {
        return 'a host:port pair is not enough — it needs the mysql:// scheme and a database name';
    }
    if (/^mysql:\/\//i.test(raw)) {
        if (/^mysql:\/\/[^@/]*@[^/]*\/?$/i.test(raw) || !/^mysql:\/\/[^@/]*@[^/]+\/.+/i.test(raw)) {
            return "it starts with mysql:// but is missing the database name "
                + "(mysql://user:password@host:port/database)";
        }
        return "it starts with mysql:// but could not be parsed — check the host and port";
    }
    return "it must start with mysql://";
}

// Drizzle wraps driver errors, so the actionable code (ECONNREFUSED,
// ER_ACCESS_DENIED_ERROR, ...) lives on the innermost `cause`, not the
// wrapper. Walk the chain so the real reason is never swallowed.
function rootCause(err) {
    let cur = err;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (cur.code) return cur;
        cur = cur.cause;
    }
    return err;
}

function diagnose(code, sqlState) {
    switch (code) {
        case "ECONNREFUSED":
            return "MySQL is not listening on that host/port. Is the server running, and is the host/port correct "
                + "(containers must NOT use 127.0.0.1 — use the service name or host IP)?";
        case "ENOTFOUND":
            return "Hostname could not be resolved. Check the host in DATABASE_URL and your DNS/network.";
        case "ETIMEDOUT":
        case "EHOSTUNREACH":
            return "Connection timed out / host unreachable. Check firewall, security groups and routing.";
        case "ER_ACCESS_DENIED_ERROR":
            return "MySQL rejected the username or password. Check the credentials in DATABASE_URL "
                + "(URL-encode special characters such as @ : / # in the password).";
        case "ER_BAD_DB_ERROR":
            return "The database named in DATABASE_URL does not exist. Create it first, e.g. "
                + "CREATE DATABASE pulse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;";
        case "PROTOCOL_CONNECTION_LOST":
        case "ECONNRESET":
            return "The connection dropped during the handshake. Check for a proxy/firewall interrupting long-lived connections.";
        default:
            if (sqlState) return `MySQL reported SQLSTATE ${sqlState}. Check the server logs and permissions.`;
            return "Is MySQL running, reachable, and does the database exist?";
    }
}

function describeDatabaseUrl(url) {
    try {
        const raw = (url ?? "").trim().replace(/^["']|["']$/g, "");
        const u = new URL(raw);
        const auth = u.username ? `${u.username}${u.password ? ":***" : ""}` : "(no user)";
        return `${auth}@${u.hostname || "?"}:${u.port || "3306"}${u.pathname || ""}`;
    } catch {
        return "(DATABASE_URL is not a valid URL — expected mysql://user:password@host:port/database)";
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
