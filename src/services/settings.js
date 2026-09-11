const DEFAULT_MODULES = {
    moderation: true, automod: true, logging: true, orders: true, welcome: true,
    tickets: true, leveling: true, economy: true, starboard: true, reactionRoles: true,
    analytics: true, achievements: true, automation: true, giveaways: true, suggestions: true, afk: true
};
const DEFAULT_AUTOMOD = {
    enabled: true,
    maxMentions: 5,
    spamThreshold: 5,
    spamWindowMs: 5000,
    inviteFilter: true,
    linkFilter: false,
    raidJoinThreshold: 10,
    raidWindowMs: 30000,
    newAccountFilter: true,
    newAccountMaxAgeDays: 7,
    emojiSpamThreshold: 10,
    zalgoFilter: true,
    scamUrlFilter: true,
    clusterSpam: true,
    clusterSpamThreshold: 3,
    clusterSpamWindowMs: 60000,
    autoLockdown: true,
};

const JSON_FIELDS = [
    "staffRoleIds", "moderatorRoleIds", "ignoredChannelIds", "ignoredRoleIds", "ignoredUserIds",
    "modules", "automod", "orders",
];
const ID_ARRAY_FIELDS = ["staffRoleIds", "moderatorRoleIds", "ignoredChannelIds", "ignoredRoleIds", "ignoredUserIds"];
const AUTOMOD_RANGES = {
    maxMentions: [1, 50],
    spamThreshold: [2, 50],
    spamWindowMs: [1000, 120000],
    raidJoinThreshold: [2, 100],
    raidWindowMs: [5000, 600000],
    newAccountMaxAgeDays: [1, 90],
    emojiSpamThreshold: [2, 100],
    clusterSpamThreshold: [2, 20],
    clusterSpamWindowMs: [5000, 600000],
};

function parseField(key, val) {
    if (val == null)
        return key.endsWith("Ids") ? [] : {};
    try {
        return JSON.parse(val);
    }
    catch {
        return key.endsWith("Ids") ? [] : {};
    }
}

function serializeField(key, val) {
    return JSON.stringify(val ?? (key.endsWith("Ids") ? [] : {}));
}

function validatePatch(patch) {
    if (!patch || typeof patch !== "object") throw new Error("Invalid settings patch");
    if ("prefix" in patch) {
        const p = patch.prefix;
        if (typeof p !== "string" || p.length < 1 || p.length > 10 || /\s/.test(p)) throw new Error("Invalid prefix: must be 1–10 chars with no whitespace");
    }
    for (const f of ID_ARRAY_FIELDS) {
        if (f in patch) {
            const v = patch[f];
            if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`Invalid ${f}: must be an array of strings`);
        }
    }
    if ("automod" in patch && patch.automod !== undefined) {
        const a = patch.automod;
        if (!a || typeof a !== "object" || Array.isArray(a)) throw new Error("Invalid automod: must be an object");
        for (const [k, [min, max]] of Object.entries(AUTOMOD_RANGES)) {
            if (k in a && a[k] !== undefined) {
                const n = a[k];
                if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid automod.${k}: must be ${min}–${max}`);
            }
        }
    }
}

export class SettingsService {
    prisma;
    client;
    constructor(prisma, client = null) {
        this.prisma = prisma;
        this.client = client;
    }
    setClient(client) { this.client = client; }
    parse(row) {
        if (!row)
            return row;
        const o = { ...row };
        for (const f of JSON_FIELDS)
            o[f] = parseField(f, row[f]);
        return o;
    }
    async get(guildId) {
        const row = await this.prisma.guildConfig.upsert({
            where: { guildId },
            update: {},
            create: {
                guildId,
                modules: JSON.stringify(DEFAULT_MODULES),
                automod: JSON.stringify(DEFAULT_AUTOMOD),
                staffRoleIds: "[]",
                moderatorRoleIds: "[]",
                ignoredChannelIds: "[]",
                ignoredRoleIds: "[]",
                ignoredUserIds: "[]",
            },
        });
        return this.parse(row);
    }
    async patch(guildId, data) {
        validatePatch(data);
        const next = { ...data };
        for (const f of JSON_FIELDS) {
            if (f in next)
                next[f] = serializeField(f, next[f]);
        }
        // Handle prefix cache invalidation
        if ("prefix" in data && this.client?.services?.prefix) {
            this.client.services.prefix.invalidate(guildId);
        }
        // Upsert to handle new guilds (P2025 fix) — creates with defaults if missing
        const result = await this.prisma.guildConfig.upsert({
            where: { guildId },
            update: { ...next, updatedAt: new Date() },
            create: {
                guildId,
                logChannelId: next.logChannelId ?? null,
                modLogChannelId: next.modLogChannelId ?? null,
                welcomeChannelId: next.welcomeChannelId ?? null,
                goodbyeChannelId: next.goodbyeChannelId ?? null,
                prefix: next.prefix ?? "!",
                staffRoleIds: next.staffRoleIds ?? "[]",
                moderatorRoleIds: next.moderatorRoleIds ?? "[]",
                ignoredChannelIds: next.ignoredChannelIds ?? "[]",
                ignoredRoleIds: next.ignoredRoleIds ?? "[]",
                ignoredUserIds: next.ignoredUserIds ?? "[]",
                modules: next.modules ?? JSON.stringify(DEFAULT_MODULES),
                automod: next.automod ?? JSON.stringify(DEFAULT_AUTOMOD),
                orders: next.orders ?? "{}",
            },
        });
        // Also invalidate prefix cache if prefix was changed (for direct patch)
        if ("prefix" in data && this.client?.services?.prefix) {
            // Ensure cache is set to new value for immediate effect
            const newPrefix = data.prefix ?? "!";
            this.client.services.prefix.cache.set(guildId, { prefix: newPrefix, expires: Date.now() + 5 * 60 * 1000 });
        }
        return result;
    }
    async setModule(guildId, key, value) {
        const current = await this.get(guildId);
        const modules = { ...current.modules, [key]: value };
        return this.patch(guildId, { modules });
    }
    async isModuleEnabled(guildId, key) {
        const current = await this.get(guildId);
        const modules = current.modules;
        return modules[key] ?? true;
    }
}
