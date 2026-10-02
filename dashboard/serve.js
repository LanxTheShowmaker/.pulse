// Standalone entry point for the dashboard.
// The bot imports ./index.js and calls startServer() itself after login;
// running `npm start` inside dashboard/ uses this file to boot the web
// server without a Discord gateway connection.
import { startServer } from "./index.js";
import { logger } from "../core/logger.js";

startServer().catch(e => {
    logger.error("dashboard", "failed to start", e?.message ?? e);
    process.exit(1);
});