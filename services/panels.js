import { EmbedBuilder } from "@discordjs/builders";
import { eq, and, asc } from "drizzle-orm";
import { panel } from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class PanelService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async find(guildId, panelType) {
        return one(await this.db.select().from(panel)
            .where(and(eq(panel.guildId, guildId), eq(panel.panelType, panelType))).limit(1));
    }

    async create(guildId, panelType, channelId, options = {}) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return null;

        const embed = this.buildEmbed(options);

        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
        if (!msg) return null;

        const data = clean({
            guildId, panelType, channelId, messageId: msg.id,
            title: options.title, description: options.description,
            bannerUrl: options.bannerUrl, thumbnailUrl: options.thumbnailUrl,
            embedColor: options.embedColor, footerText: options.footerText,
            footerIcon: options.footerIcon, enabled: true,
        });
        await this.db.insert(panel).values({ id: uuid(), ...data })
            .onDuplicateKeyUpdate({ set: data });
        return this.find(guildId, panelType);
    }

    async update(guildId, panelType, options = {}) {
        const row = await this.find(guildId, panelType);
        if (!row || !row.messageId) return null;

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(row.channelId);
        if (!channel?.isTextBased()) return null;

        const msg = await channel.messages.fetch(row.messageId).catch(() => null);
        if (!msg) return this.repost(guildId, panelType);

        const embed = this.buildEmbed({ ...row, ...options });
        await msg.edit({ embeds: [embed] }).catch(() => {});

        const set = clean({ ...options, updatedAt: new Date() });
        await this.db.update(panel).set(set).where(eq(panel.id, row.id));
        return one(await this.db.select().from(panel).where(eq(panel.id, row.id)).limit(1));
    }

    async repost(guildId, panelType) {
        const row = await this.find(guildId, panelType);
        if (!row) return null;

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(row.channelId);
        if (!channel?.isTextBased()) return null;

        const embed = this.buildEmbed(row);
        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
        if (!msg) return null;

        await this.db.update(panel).set({ messageId: msg.id, updatedAt: new Date() }).where(eq(panel.id, row.id));
        return one(await this.db.select().from(panel).where(eq(panel.id, row.id)).limit(1));
    }

    async disable(guildId, panelType) {
        const row = await this.find(guildId, panelType);
        if (!row) return null;

        // Delete the message if it exists
        if (row.messageId) {
            const guild = this.client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(row.channelId);
            if (channel?.isTextBased()) {
                await channel.messages.fetch(row.messageId).then(m => m.delete()).catch(() => {});
            }
        }

        await this.db.update(panel).set({ enabled: false, messageId: null }).where(eq(panel.id, row.id));
        return one(await this.db.select().from(panel).where(eq(panel.id, row.id)).limit(1));
    }

    async restoreAll() {
        const panels = await this.db.select().from(panel).where(eq(panel.enabled, true));
        let restored = 0;
        for (const p of panels) {
            try {
                await this.repost(p.guildId, p.panelType);
                restored++;
            } catch (e) {
                logger.error("panels", `restore failed for ${p.panelType}`, e.message);
            }
        }
        return restored;
    }

    buildEmbed(opts) {
        const color = opts.embedColor ?? Theme.accent;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(opts.title ?? "Panel")
            .setDescription(opts.description ?? "")
            .setFooter({ text: opts.footerText ?? Brand.footer, iconURL: opts.footerIcon })
            .setTimestamp();

        if (opts.bannerUrl) embed.setImage(opts.bannerUrl);
        if (opts.thumbnailUrl) embed.setThumbnail(opts.thumbnailUrl);

        return embed;
    }

    async list(guildId) {
        return this.db.select().from(panel)
            .where(eq(panel.guildId, guildId)).orderBy(asc(panel.panelType));
    }
}
