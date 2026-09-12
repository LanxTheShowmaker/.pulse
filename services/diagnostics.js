import { logger } from "../core/logger.js";

export class DiagnosticsService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async health() {
        const results = [];

        // Database
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            results.push({ name: "Database", status: "OK", detail: "Prisma query succeeded" });
        } catch (e) {
            results.push({ name: "Database", status: "ERROR", detail: e.message });
        }

        // WebSocket
        const wsPing = this.client.ws.ping;
        results.push({ name: "WebSocket", status: wsPing > 0 ? "OK" : "ERROR", detail: `${wsPing}ms` });

        // Guilds
        results.push({ name: "Guilds", status: "OK", detail: `${this.client.guilds.cache.size}` });

        // Uptime
        const uptime = Math.floor(this.client.uptime / 1000);
        results.push({ name: "Uptime", status: "OK", detail: `${uptime}s` });

        return results;
    }
}
