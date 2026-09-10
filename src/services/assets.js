import { ChannelType, PermissionFlagsBits } from "discord.js";
import { logger } from "../core/logger.js";

const ASSET_CHANNEL_CANDIDATES = ["pulse-assets", "server-assets", "assets", "bot-assets", "pulse-asset"];
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB Discord limit
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

export class AssetService {
    client;
    constructor(client) {
        this.client = client;
    }

    normalize(name) {
        return name.toLowerCase().trim().replace(/[_]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-");
    }

    findAssetChannel(guild) {
        const norms = ASSET_CHANNEL_CANDIDATES.map((c) => this.normalize(c));
        for (const cand of norms) {
            for (const ch of guild.channels.cache.values()) {
                if (ch.type !== ChannelType.GuildText) continue;
                if (this.normalize(ch.name) === cand) return ch;
            }
        }
        return null;
    }

    async ensureAssetChannel(guild) {
        const existing = this.findAssetChannel(guild);
        if (existing) return { channel: existing, action: "reused" };
        const me = guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return { channel: null, action: "blocked" };
        // Hidden from @everyone, visible to staff/mod if configured, else visible to bot
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        ];
        // Add staff/mod if config exists
        try {
            const cfg = await this.client?.services?.settings.get(guild.id).catch(() => null);
            const ids = [...(cfg?.staffRoleIds ?? []), ...(cfg?.moderatorRoleIds ?? [])];
            for (const id of ids) overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
        } catch {}
        try {
            const ch = await guild.channels.create({
                name: "pulse-assets",
                type: ChannelType.GuildText,
                topic: ".pulse private asset storage — do not delete",
                permissionOverwrites: overwrites,
            });
            return { channel: ch, action: "created" };
        } catch (e) {
            logger.error("assets", "ensure asset channel failed", e);
            return { channel: null, action: "blocked" };
        }
    }

    isValidImageAttachment(att) {
        if (!att) return { ok: false, reason: "No attachment" };
        if (att.size > MAX_FILE_SIZE) return { ok: false, reason: `File too large (${(att.size / 1024 / 1024).toFixed(1)}MB > 8MB)` };
        const isImage = (att.contentType && att.contentType.startsWith("image/")) || IMAGE_EXT.test(att.name ?? att.url ?? "");
        if (!isImage) return { ok: false, reason: "Attachment is not an image (png/jpg/gif/webp expected)" };
        return { ok: true };
    }

    // Re-upload to asset channel for persistence, return persisted URL
    async persistAttachment(guild, attachment) {
        const { channel } = await this.ensureAssetChannel(guild);
        if (!channel) throw new Error("Cannot create asset channel — missing Manage Channels");
        const validation = this.isValidImageAttachment(attachment);
        if (!validation.ok) throw new Error(validation.reason);
        // Fetch the file buffer via attachment URL
        let buffer;
        try {
            const res = await fetch(attachment.url);
            if (!res.ok) throw new Error("Failed to fetch attachment");
            buffer = Buffer.from(await res.arrayBuffer());
        } catch (e) {
            // Fallback: use original URL if fetch fails (e.g., no fetch)
            logger.warn("assets", "fetch attachment failed, using original URL", e);
            return { url: attachment.url, channelId: channel.id, messageId: null, action: "reused" };
        }
        try {
            const msg = await channel.send({ files: [{ attachment: buffer, name: attachment.name ?? "banner.png" }] });
            const persistedAtt = msg.attachments.first();
            const url = persistedAtt?.url ?? attachment.url;
            return { url, channelId: channel.id, messageId: msg.id, action: "persisted" };
        } catch (e) {
            logger.error("assets", "persist failed", e);
            return { url: attachment.url, channelId: channel.id, messageId: null, action: "fallback" };
        }
    }

    async persistUrl(guild, url) {
        // If URL is already a discord CDN, reuse; otherwise fetch and re-upload
        if (!url) throw new Error("No URL");
        try {
            const u = new URL(url);
            if (u.hostname.includes("cdn.discordapp.com") || u.hostname.includes("media.discordapp.net")) {
                return { url, channelId: null, messageId: null, action: "reused" };
            }
        } catch {}
        // Try fetch and upload
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Fetch failed");
            const ct = res.headers.get("content-type") ?? "";
            if (!ct.startsWith("image/")) throw new Error("URL is not an image");
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > MAX_FILE_SIZE) throw new Error("Image too large");
            const { channel } = await this.ensureAssetChannel(guild);
            if (!channel) return { url, channelId: null, messageId: null, action: "reused" };
            const msg = await channel.send({ files: [{ attachment: buf, name: "banner.png" }] });
            const persisted = msg.attachments.first()?.url ?? url;
            return { url: persisted, channelId: channel.id, messageId: msg.id, action: "persisted" };
        } catch (e) {
            logger.warn("assets", "persistUrl fallback", e);
            return { url, channelId: null, messageId: null, action: "reused" };
        }
    }

    async validateBannerUrl(guild, panel) {
        if (!panel?.bannerUrl) return { ok: true, status: "none" };
        try {
            // Check if message still exists if we have IDs
            if (panel.bannerChannelId && panel.bannerMessageId) {
                const ch = guild.channels.cache.get(panel.bannerChannelId) ?? await guild.channels.fetch(panel.bannerChannelId).catch(() => null);
                if (!ch) return { ok: false, status: "missing_channel" };
                const msg = await ch.messages.fetch(panel.bannerMessageId).catch(() => null);
                if (!msg) return { ok: false, status: "missing_message" };
            }
            // Try HEAD fetch for URL
            const res = await fetch(panel.bannerUrl, { method: "HEAD" }).catch(() => null);
            if (res && !res.ok && res.status === 404) return { ok: false, status: "404" };
            return { ok: true, status: "ok" };
        } catch {
            return { ok: true, status: "unknown" };
        }
    }
}
