import { eq } from "drizzle-orm";
import { guildBranding } from "../db/schema/index.js";
import { clean, one } from "../db/util.js";
import { logger } from "../core/logger.js";

export class BrandingService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async get(guildId) {
        return one(await this.db.select().from(guildBranding).where(eq(guildBranding.guildId, guildId)).limit(1));
    }

    async set(guildId, data) {
        const set = clean(data);
        await this.db.insert(guildBranding).values({ guildId, ...set })
            .onDuplicateKeyUpdate({ set });
        return one(await this.db.select().from(guildBranding).where(eq(guildBranding.guildId, guildId)).limit(1));
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
