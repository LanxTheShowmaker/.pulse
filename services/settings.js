import { eq } from "drizzle-orm";
import { guildConfig } from "../db/schema/index.js";
import { clean, one } from "../db/util.js";
import { logger } from "../core/logger.js";

const DEFAULTS = {
    logChannelId: null,
    modLogChannelId: null,
    welcomeChannelId: null,
    goodbyeChannelId: null,
    ticketCategoryId: null,
    ticketLogChannelId: null,
    staffRoleIds: "[]",
    moderatorRoleIds: "[]",
    ignoredChannelIds: "[]",
    ignoredRoleIds: "[]",
    ignoredUserIds: "[]",
    modules: "{}",
    automod: "{}",
    orders: "{}",
    prefix: "!",
};

export class SettingsService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
        this._cache = new Map();
    }

    async get(guildId) {
        if (this._cache.has(guildId)) return this._cache.get(guildId);
        let config = one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
        if (!config) {
            await this.db.insert(guildConfig).values({ guildId });
            config = one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
        }
        const parsed = this.parse(config);
        this._cache.set(guildId, parsed);
        return parsed;
    }

    async patch(guildId, data) {
        const set = clean(data);
        await this.db.insert(guildConfig).values({ guildId, ...set })
            .onDuplicateKeyUpdate({ set });
        const config = one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
        const parsed = this.parse(config);
        this._cache.set(guildId, parsed);
        return parsed;
    }

    async setModule(guildId, module, enabled) {
        const config = await this.get(guildId);
        const modules = JSON.parse(config.modules);
        modules[module] = enabled;
        return this.patch(guildId, { modules: JSON.stringify(modules) });
    }

    isModuleEnabled(config, module) {
        const modules = JSON.parse(config.modules);
        return modules[module] !== false;
    }

    isIgnored(config, { userId, channelId, roleIds = [] } = {}) {
        if (userId && config.ignoredUserIds.includes(userId)) return true;
        if (channelId && config.ignoredChannelIds.includes(channelId)) return true;
        if (roleIds.length && config.ignoredRoleIds.some(id => roleIds.includes(id))) return true;
        return false;
    }

    parse(config) {
        return {
            ...config,
            staffRoleIds: JSON.parse(config.staffRoleIds || "[]"),
            moderatorRoleIds: JSON.parse(config.moderatorRoleIds || "[]"),
            ignoredChannelIds: JSON.parse(config.ignoredChannelIds || "[]"),
            ignoredRoleIds: JSON.parse(config.ignoredRoleIds || "[]"),
            ignoredUserIds: JSON.parse(config.ignoredUserIds || "[]"),
            modules: config.modules || "{}",
            automod: JSON.parse(config.automod || "{}"),
            orders: JSON.parse(config.orders || "{}"),
        };
    }

    clearCache(guildId) {
        if (guildId) this._cache.delete(guildId);
        else this._cache.clear();
    }

    // ─── API BOUNDARY: Settings API ──────────────────────────

    async getAllSettings(guildId) {
        const config = one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
        if (!config) {
            if (this._cache.get(guildId)) return this._cache.get(guildId);
            await this.db.insert(guildConfig).values({ guildId });
            const created = one(await this.db.select().from(guildConfig).where(eq(guildConfig.guildId, guildId)).limit(1));
            return this.parse(created);
        }
        return this.parse(config);
    }

    async getModuleState(guildId, module) {
        const config = await this.get(guildId);
        return this.isModuleEnabled(config, module);
    }

    async setModuleState(guildId, module, enabled) {
        return this.setModule(guildId, module, enabled);
    }

    async getIgnoredUsers(guildId, limit = 50) {
        const config = await this.get(guildId);
        return JSON.parse(config.ignoredUserIds || "[]").slice(0, limit);
    }

    async getIgnoredChannels(guildId, limit = 50) {
        const config = await this.get(guildId);
        return JSON.parse(config.ignoredChannelIds || "[]").slice(0, limit);
    }

    async getIgnoredRoles(guildId, limit = 50) {
        const config = await this.get(guildId);
        return JSON.parse(config.ignoredRoleIds || "[]").slice(0, limit);
    }
}
