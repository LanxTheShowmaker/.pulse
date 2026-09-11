import { logger } from "../core/logger.js";

const DETECTORS = {
    spam:       { label: "Spam",        check: (m, c) => { const t = c.spam?.threshold ?? 5; return m._spamCount >= t; } },
    words:      { label: "Banned Words", check: (m, c) => { const w = c.words?.list ?? []; return w.some(w => m.content.toLowerCase().includes(w.toLowerCase())); } },
    links:      { label: "Links",        check: (m) => /https?:\/\/[^\s]+/i.test(m.content) },
    invites:    { label: "Discord Invites", check: (m) => /discord\.gg\/|discordapp\.com\/invite\//i.test(m.content) },
    caps:       { label: "Caps Lock",    check: (m, c) => { const t = c.caps?.threshold ?? 70; const letters = m.content.replace(/[^a-zA-Z]/g, ""); return letters.length > 10 && (m.content.replace(/[^A-Z]/g, "").length / letters.length) * 100 >= t; } },
    mentions:   { label: "Mass Mentions", check: (m, c) => { const t = c.mentions?.threshold ?? 5; return m.mentions.users.size >= t; } },
    emoji:      { label: "Emoji Spam",   check: (m, c) => { const t = c.emoji?.threshold ?? 10; const emojis = m.content.match(/\p{Emoji_Presentation}/gu); return emojis && emojis.length >= t; } },
    duplicate:  { label: "Duplicate Text", check: (m, c) => { const w = c.duplicate?.window ?? 30; return m._isDuplicate; } },
};

export class AutoModService {
    constructor(prisma, client, settings, logging) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
        this.logging = logging;
        this._recent = new Map(); // userId:timestamp[] for spam detection
        this._messages = new Map(); // channelId:content[] for duplicate detection
    }

    async handleMessage(message) {
        if (message.author.bot || !message.guild) return;
        const config = await this.settings.get(message.guild.id);
        if (!this.settings.isModuleEnabled(config, "automod")) return;

        const ac = config.automod;
        if (!ac || Object.keys(ac).length === 0) return;

        // Exemptions
        if (this.isExempt(message.member, message.channel, ac)) return;

        // Track spam
        const now = Date.now();
        const key = `${message.guild.id}:${message.author.id}`;
        const times = this._recent.get(key) ?? [];
        times.push(now);
        this._recent.set(key, times.filter(t => now - t < 5000));

        // Track duplicates
        const ckey = message.channel.id;
        const recent = this._messages.get(ckey) ?? [];
        message._isDuplicate = recent.includes(message.content) && message.content.length > 10;
        recent.push(message.content);
        if (recent.length > 20) recent.shift();
        this._messages.set(ckey, recent);

        message._spamCount = times.length;

        // Run detectors
        for (const [name, detector] of Object.entries(DETECTORS)) {
            if (!ac[name]?.enabled) continue;
            if (!detector.check(message, ac)) continue;

            await this.action(message, name, ac[name]);
            return; // One action per message
        }
    }

    isExempt(member, channel, ac) {
        if (!member) return false;
        if (member.permissions.has("Administrator")) return true;
        const exempt = ac.exempt ?? {};
        const roleIds = new Set(member.roles.cache.keys());
        if (exempt.roles?.some(id => roleIds.has(id))) return true;
        if (exempt.channels?.includes(channel?.id)) return true;
        return false;
    }

    async action(message, detector, config) {
        const action = config.action ?? "warn";
        const reason = `AutoMod: ${DETECTORS[detector]?.label ?? detector}`;

        try {
            await message.delete().catch(() => {});
        } catch {}

        const { moderation } = this.client.services;
        const target = message.author;

        switch (action) {
            case "warn":
                await moderation.warn(message.guild.id, { id: this.client.user.id, tag: "AutoMod", user: this.client.user }, target, reason);
                break;
            case "mute":
                await moderation.timeout(message.guild.id, { id: this.client.user.id, tag: "AutoMod", user: this.client.user }, target, reason, { ms: 60_000, text: "1m" });
                break;
            case "kick":
                await moderation.kick(message.guild.id, { id: this.client.user.id, tag: "AutoMod", user: this.client.user }, target, reason);
                break;
            case "ban":
                await moderation.ban(message.guild.id, { id: this.client.user.id, tag: "AutoMod", user: this.client.user }, target, reason);
                break;
        }
    }

    testMessage(message, config) {
        const results = [];
        for (const [name, detector] of Object.entries(DETECTORS)) {
            if (!config[name]?.enabled) continue;
            if (detector.check(message, config)) {
                results.push({ detector: name, label: detector.label });
            }
        }
        return results;
    }
}
