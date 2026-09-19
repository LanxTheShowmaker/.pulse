import { eq, and, desc, inArray } from "drizzle-orm";
import { backup } from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
import { logger } from "../core/logger.js";

export class BackupService {
    constructor(db, client, settings) {
        this.db = db;
        this.client = client;
        this.settings = settings;
    }

    async create(guildId, createdById, createdByTag) {
        const config = await this.settings.get(guildId);
        const data = JSON.stringify(config, null, 2);

        const id = uuid();
        await this.db.insert(backup).values(clean({ id, guildId, data, createdById, createdByTag }));
        const row = one(await this.db.select().from(backup).where(eq(backup.id, id)));

        // Keep only last 10 backups per guild
        const all = await this.db.select({ id: backup.id }).from(backup)
            .where(eq(backup.guildId, guildId)).orderBy(desc(backup.createdAt));

        if (all.length > 10) {
            const toDelete = all.slice(10).map(b => b.id);
            await this.db.delete(backup).where(inArray(backup.id, toDelete));
        }

        return row;
    }

    async restore(backupId) {
        const row = one(await this.db.select().from(backup).where(eq(backup.id, backupId)).limit(1));
        if (!row) return { ok: false, error: "Backup not found." };

        const data = JSON.parse(row.data);

        // Restore GuildConfig. Backups store the parsed config shape, so
        // re-serialize arrays/objects to the JSON strings the columns hold
        // and drop bookkeeping fields before patching.
        if (data.guildId) {
            const { guildId, createdAt, updatedAt, ...rest } = data;
            const payload = {};
            for (const [k, v] of Object.entries(rest)) {
                payload[k] = typeof v === "string" || v === null || v === undefined ? v : JSON.stringify(v);
            }
            await this.settings.patch(guildId, payload);
        }

        return { ok: true, backup: row };
    }

    async list(guildId, limit = 10) {
        return this.db.select().from(backup)
            .where(eq(backup.guildId, guildId))
            .orderBy(desc(backup.createdAt)).limit(limit);
    }

    async delete(backupId) {
        const row = one(await this.db.select().from(backup).where(eq(backup.id, backupId)).limit(1));
        if (!row) return null;
        await this.db.delete(backup).where(eq(backup.id, backupId)).catch(() => null);
        return row;
    }
}
