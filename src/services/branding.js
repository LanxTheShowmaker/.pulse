import { logger } from "../core/logger.js";

export class BrandingService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async get(guildId) {
        return this.prisma.guildBranding.findUnique({ where: { guildId } });
    }

    async set(guildId, data) {
        return this.prisma.guildBranding.upsert({
            where: { guildId },
            create: { guildId, ...data },
            update: data,
        });
    }

    async applyNickname(guild) {
        const branding = await this.get(guild.id);
        if (!branding?.nickname) return;
        const me = guild.members.me;
        if (me) await me.setNickname(branding.nickname).catch(e => logger.warn("branding", "nickname failed", e.message));
    }

    async applyAll() {
        for (const [, guild] of this.client.guilds.cache) {
            await this.applyNickname(guild).catch(() => {});
        }
    }
}
