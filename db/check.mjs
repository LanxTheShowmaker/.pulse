// CLI: npm run db:check
// Diagnoses MySQL connectivity without booting the bot. Reports the precise
// failure (refused / DNS / auth / missing database) instead of a bare
// "Failed query: SELECT 1".
import "dotenv/config";
import mysql from "mysql2/promise";
import { closeDatabase, verifyDatabase } from "./index.js";

const raw = (process.env.DATABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");

if (!raw) {
    console.error("DATABASE_URL is not set. Add it to .env:");
    console.error("  DATABASE_URL=mysql://user:password@host:port/database");
    process.exit(1);
}

let parsed;
try {
    parsed = new URL(raw);
} catch {
    parsed = null;
}

if (!parsed || !/^mysql:$/.test(parsed.protocol) || !parsed.pathname.replace(/^\//, "")) {
    console.error(`DATABASE_URL is not a valid MySQL URL: ${raw}`);
    console.error("  expected format: mysql://user:password@host:port/database");
    process.exit(1);
}

const host = parsed.hostname;
const port = parsed.port || "3306";
const database = parsed.pathname.replace(/^\//, "");
console.log(`target    : ${parsed.username || "(no user)"}@${host}:${port}/${database}`);
console.log(`node      : ${process.version}`);

// Warn about the classic container mistake before even trying.
if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) {
    console.log("");
    console.log("note: the host is a loopback address. If MySQL runs in a different");
    console.log("      container or on another host, 127.0.0.1 will never connect —");
    console.log("      use that server's hostname or IP instead.");
}

// 1. Connect directly so we can tell "nothing listening" apart from
//    "listening but rejecting us", and surface the driver-level error code.
try {
    const probe = await mysql.createConnection({
        uri: raw, connectTimeout: 5000,
    });
    await probe.query("SELECT 1");
    await probe.end();
    console.log("connect   : OK (authenticated, SELECT 1 succeeded)");
} catch (e) {
    const code = e?.code ? ` [${e.code}]` : "";
    console.log(`connect   : FAILED${code}`);
    console.log(`reason    : ${e?.message ?? e}`);
    if (e?.sqlState) console.log(`sqlstate  : ${e.sqlState}`);

    switch (e?.code) {
        case "ECONNREFUSED":
            console.log("fix       : nothing is listening on that host/port.");
            break;
        case "ENOTFOUND":
            console.log("fix       : hostname does not resolve.");
            break;
        case "ETIMEDOUT":
        case "EHOSTUNREACH":
            console.log("fix       : unreachable — check firewall / security groups.");
            break;
        case "ER_ACCESS_DENIED_ERROR":
            console.log("fix       : wrong username or password.");
            break;
        case "ER_BAD_DB_ERROR":
            console.log(`fix       : database "${database}" does not exist. Create it with:`);
            console.log(`            CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
            break;
        default:
            console.log("fix       : check the MySQL server logs.");
    }
    await closeDatabase();
    process.exit(1);
}

// 2. Full app-level verification (same path the bot uses at boot).
try {
    await verifyDatabase();
    console.log("verify    : OK");
} catch (e) {
    console.log(`verify    : FAILED — ${e?.message ?? e}`);
    await closeDatabase();
    process.exit(1);
}

await closeDatabase();
console.log("");
console.log("MySQL connection is healthy.");