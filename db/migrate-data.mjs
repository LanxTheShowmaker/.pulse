// CLI: node db/migrate-data.mjs [path-to-sqlite]
// Copies every row from the legacy SQLite database into MySQL.
// Safe to re-run: tables that already contain rows are skipped.
// The SQLite file is never modified.
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { getDb, closeDatabase } from "./index.js";
import * as schema from "./schema/index.js";

const SQLITE_PATH = process.argv[2] || "C:/Users/ultim/Documents/WingzBot/prisma/pulse.db";
const TNAME = Symbol.for("drizzle:Name");

function isColumn(v) {
    return v && typeof v === "object" && typeof v.name === "string" && v.constructor && v.constructor.name.startsWith("MySql");
}

function convert(ctor, v) {
    if (v === null || v === undefined) return null;
    switch (ctor) {
        case "MySqlBoolean": return v ? true : false;
        case "MySqlTimestamp": return v instanceof Date ? v : new Date(v);
        case "MySqlBigInt53": return Number(v);
        default: return v;
    }
}

try {
    const lite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
    const db = getDb();
    const tables = Object.values(schema).filter((t) => t && typeof t === "object" && t[TNAME]);
    let total = 0;
    for (const table of tables) {
        const name = table[TNAME];
        const cols = Object.values(table).filter(isColumn);
        let rows = [];
        try {
            rows = lite.prepare(`SELECT * FROM "${name}"`).all();
        } catch (e) {
            console.log(`skip ${name}: not in sqlite (${e.message.slice(0, 60)})`);
            continue;
        }
        if (rows.length === 0) continue;
        const [{ n }] = await db.execute(
            (await import("drizzle-orm")).sql`SELECT COUNT(*) AS n FROM ${table}`,
        );
        if (Number(n) > 0) {
            console.log(`skip ${name}: target not empty (${n} rows)`);
            continue;
        }
        const colNames = new Set(cols.map((c) => c.name));
        const ctors = Object.fromEntries(cols.map((c) => [c.name, c.constructor.name]));
        let inserted = 0;
        for (let i = 0; i < rows.length; i += 200) {
            const batch = rows.slice(i, i + 200).map((r) => {
                const o = {};
                for (const [k, v] of Object.entries(r)) {
                    if (!colNames.has(k)) continue;
                    o[k] = convert(ctors[k], v);
                }
                return o;
            });
            await db.insert(table).values(batch);
            inserted += batch.length;
        }
        total += inserted;
        console.log(`migrated ${name}: ${inserted} rows`);
    }
    console.log(`done, ${total} rows total`);
    lite.close();
} catch (e) {
    console.error("data migration failed:", e?.message || e);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
