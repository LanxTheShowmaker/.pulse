import { logger } from "../core/logger.js";
export class BrandingService {
    prisma; client;
    cache = new Map();
    CACHE_TTL = 5 * 60 * 1000;
    constructor(prisma, client) { this.prisma = prisma; this.client = client; }
    async get(guildId) {
        if (!guildId) return { guildId: null, displayName: null, avatarUrl: null, bannerUrl: null, nickname: null };
        const cached = this.cache.get(guildId);
        if (cached && cached.expires > Date.now()) return cached.data;
        try {
            let row = await this.prisma.guildBranding.findUnique({ where: { guildId } }).catch(() => null);
            if (!row) {
                row = await this.prisma.guildBranding.create({ data: { guildId } }).catch(() => ({ guildId, displayName: null, avatarUrl: null, bannerUrl: null, nickname: null }));
            }
            this.cache.set(guildId, { data: row, expires: Date.now() + this.CACHE_TTL });
            return row;
        } catch (e) { return { guildId, displayName: null, avatarUrl: null, bannerUrl: null, nickname: null }; }
    }
    invalidate(guildId) { this.cache.delete(guildId); }
    async set(guildId, patch) {
        const data = {};
        if (patch.displayName !== undefined) data.displayName = patch.displayName ? String(patch.displayName).slice(0, 32) : null;
        if (patch.avatarUrl !== undefined) data.avatarUrl = patch.avatarUrl || null;
        if (patch.bannerUrl !== undefined) data.bannerUrl = patch.bannerUrl || null;
        if (patch.nickname !== undefined) data.nickname = patch.nickname ? String(patch.nickname).slice(0, 32) : null;
        if (data.avatarUrl && !isValidImageUrl(data.avatarUrl)) throw new Error("Avatar must be a valid image URL (png/jpg/webp/gif)");
        if (data.bannerUrl && !isValidImageUrl(data.bannerUrl)) throw new Error("Banner must be a valid image URL");
        try {
            const result = await this.prisma.guildBranding.upsert({ where: { guildId }, update: data, create: { guildId, ...data } });
            this.invalidate(guildId);
            await this.applyProfile({ id: guildId, members: { me: null } }).catch(() => {});
            return result;
        } catch (e) { logger.error("branding", "set failed", e); throw e; }
    }
    async applyProfile(guild) {
        if (!guild || !guild.members) return { applied: false, reason: "Guild not available" };
        const branding = await this.get(guild.id);
        const me = guild.members.me;
        if (!me) return { applied: false, reason: "Bot member not cached" };
        const desiredNick = branding.nickname || branding.displayName || null;
        const desiredAvatar = branding.avatarUrl || null;
        const results = { nick: null, avatar: null };
        try {
            const currentNick = me.nickname;
            if (desiredNick && currentNick !== desiredNick) {
                if (!me.permissions.has("ChangeNickname") && !guild.members.me.permissions.has("ManageNicknames")) {
                    results.nick = { applied: false, reason: "Missing ChangeNickname/ManageNicknames" };
                } else {
                    if (typeof guild.members.editMe === "function") {
                        await guild.members.editMe({ nick: desiredNick, reason: "Branding: per-server nickname" }).catch(async e => {
                            await me.setNickname(desiredNick).catch(err => { throw err; });
                        });
                    } else {
                        await me.setNickname(desiredNick).catch(e => { throw e; });
                    }
                    results.nick = { applied: true, value: desiredNick };
                }
            } else if (!desiredNick && currentNick) {
                if (typeof guild.members.editMe === "function") {
                    await guild.members.editMe({ nick: null, reason: "Branding reset" }).catch(async e => {
                        await me.setNickname(null).catch(() => {});
                    });
                } else {
                    await me.setNickname(null).catch(() => {});
                }
                results.nick = { applied: true, value: null };
            } else {
                results.nick = { applied: false, reason: "Already set or no custom nick" };
            }
        } catch (e) { results.nick = { applied: false, reason: e.message.slice(0, 200) }; logger.warn("branding", "nick failed", e.message); }
        try {
            const currentAvatar = me.avatar;
            if (desiredAvatar) {
                let dataUri = null;
                try {
                    const res = await fetch(desiredAvatar).catch(() => null);
                    if (res && res.ok) {
                        const ct = res.headers.get("content-type") || "image/png";
                        if (ct.startsWith("image/")) {
                            const buf = Buffer.from(await res.arrayBuffer());
                            if (buf.length > 0 && buf.length <= 8 * 1024 * 1024) {
                                dataUri = `data:${ct};base64,${buf.toString("base64")}`;
                            }
                        }
                    }
                } catch {}
                if (!dataUri) {
                    results.avatar = { applied: false, reason: "Failed to download avatar image" };
                    logger.warn("branding", "avatar download failed", { url: desiredAvatar });
                } else if (typeof guild.members.editMe === "function") {
                    await guild.members.editMe({ avatar: dataUri, reason: "Branding: per-server avatar" });
                    results.avatar = { applied: true, value: desiredAvatar };
                } else {
                    await me.edit({ avatar: dataUri });
                    results.avatar = { applied: true, value: desiredAvatar };
                }
            } else if (!desiredAvatar && currentAvatar) {
                if (typeof guild.members.editMe === "function") {
                    await guild.members.editMe({ avatar: null, reason: "Branding reset avatar" }).catch(() => {});
                    results.avatar = { applied: true, value: null };
                }
            } else {
                results.avatar = { applied: false, reason: "No custom avatar or already set" };
            }
        } catch (e) {
            results.avatar = { applied: false, reason: e.message?.slice(0, 300) || String(e) };
            logger.warn("branding", "per-guild avatar apply failed", e.message || e);
        }
        return results;
    }
    async applyNickname(guild) {
        return this.applyProfile(guild);
    }
    async getDisplay(guild) {
        if (!guild) {
            const bot = this.client?.user;
            return { name: ".pulse", icon: bot?.displayAvatarURL() || null, banner: null };
        }
        const branding = await this.get(guild.id).catch(() => null);
        const bot = this.client?.user;
        let guildAvatar = null;
        try {
            const me = guild.members?.me;
            if (me) {
                guildAvatar = me.displayAvatarURL({ size: 128 }) !== bot?.displayAvatarURL({ size: 128 }) ? me.displayAvatarURL({ size: 128 }) : null;
                if (!guildAvatar && branding?.avatarUrl) guildAvatar = branding.avatarUrl;
            }
        } catch {}
        const icon = guildAvatar || branding?.avatarUrl || guild.iconURL({ size: 128 }) || bot?.displayAvatarURL() || null;
        const banner = branding?.bannerUrl || null;
        const name = branding?.nickname || branding?.displayName || bot?.username || ".pulse";
        return {
            name,
            icon,
            banner,
            logo: branding?.avatarUrl || null,
            thumbnail: branding?.avatarUrl || null,
            footerText: ".pulse",
            footerIcon: icon,
        };
    }
}
function isValidImageUrl(url) {
    if (!url) return false;
    try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) || url.includes("cdn.discordapp") || url.includes("media.discordapp");
    } catch { return false; }
}
