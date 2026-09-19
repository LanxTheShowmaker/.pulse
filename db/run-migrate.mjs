// CLI: node db/run-migrate.mjs
// Applies pending MySQL migrations. Safe to re-run (idempotent).
import "dotenv/config";
import { runMigrations } from "./migrate.js";
import { closeDatabase } from "./index.js";

try {
    await runMigrations();
    console.log("migrations complete");
} catch (e) {
    console.error("migration failed:", e?.message || e);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
