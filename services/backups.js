import { logger } from "../core/logger.js";

export class BackupService {
    constructor(prisma, client, settings) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
    }

    async create(guildId, createdById, createdByTag) {
        const config = await this.settings.get(guildId);
        const data = JSON.stringify(config, null, 2);

        const backup = await this.prisma.backup.create({
            data: { guildId, data, createdById, createdByTag },
        });

        // Keep only last 10 backups per guild
        const all = await this.prisma.backup.findMany({
            where: { guildId },
            orderBy: { createdAt: "desc" },
        });

        if (all.length > 10) {
            const toDelete = all.slice(10);
            await this.prisma.backup.deleteMany({
                where: { id: { in: toDelete.map(b => b.id) } },
            });
        }

        return backup;
    }

    async restore(backupId) {
        const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
        if (!backup) return { ok: false, error: "Backup not found." };

        const data = JSON.parse(backup.data);

        // Restore GuildConfig
        if (data.guildId) {
            await this.settings.set(data.guildId, data);
        }

        return { ok: true, backup };
    }

    async list(guildId, limit = 10) {
        return this.prisma.backup.findMany({
            where: { guildId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    async delete(backupId) {
        return this.prisma.backup.delete({ where: { id: backupId } }).catch(() => null);
    }
}
