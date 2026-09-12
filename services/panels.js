import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class PanelService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async create(guildId, panelType, channelId, options = {}) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return null;

        const embed = this.buildEmbed(options);

        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
        if (!msg) return null;

        return this.prisma.panel.upsert({
            where: { guildId_panelType: { guildId, panelType } },
            create: {
                guildId, panelType, channelId, messageId: msg.id,
                title: options.title, description: options.description,
                bannerUrl: options.bannerUrl, thumbnailUrl: options.thumbnailUrl,
                embedColor: options.embedColor, footerText: options.footerText,
                footerIcon: options.footerIcon, enabled: true,
            },
            update: {
                channelId, messageId: msg.id,
                title: options.title, description: options.description,
                bannerUrl: options.bannerUrl, thumbnailUrl: options.thumbnailUrl,
                embedColor: options.embedColor, footerText: options.footerText,
                footerIcon: options.footerIcon, enabled: true,
            },
        });
    }

    async update(guildId, panelType, options = {}) {
        const panel = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType } } });
        if (!panel || !panel.messageId) return null;

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(panel.channelId);
        if (!channel?.isTextBased()) return null;

        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!msg) return this.repost(guildId, panelType);

        const embed = this.buildEmbed({ ...panel, ...options });
        await msg.edit({ embeds: [embed] }).catch(() => {});

        return this.prisma.panel.update({
            where: { id: panel.id },
            data: { ...options, updatedAt: new Date() },
        });
    }

    async repost(guildId, panelType) {
        const panel = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType } } });
        if (!panel) return null;

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        const channel = guild.channels.cache.get(panel.channelId);
        if (!channel?.isTextBased()) return null;

        const embed = this.buildEmbed(panel);
        const msg = await channel.send({ embeds: [embed] }).catch(() => null);
        if (!msg) return null;

        return this.prisma.panel.update({
            where: { id: panel.id },
            data: { messageId: msg.id, updatedAt: new Date() },
        });
    }

    async disable(guildId, panelType) {
        const panel = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType } } });
        if (!panel) return null;

        // Delete the message if it exists
        if (panel.messageId) {
            const guild = this.client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(panel.channelId);
            if (channel?.isTextBased()) {
                await channel.messages.fetch(panel.messageId).then(m => m.delete()).catch(() => {});
            }
        }

        return this.prisma.panel.update({
            where: { id: panel.id },
            data: { enabled: false, messageId: null },
        });
    }

    async restoreAll() {
        const panels = await this.prisma.panel.findMany({ where: { enabled: true } });
        let restored = 0;
        for (const panel of panels) {
            try {
                await this.repost(panel.guildId, panel.panelType);
                restored++;
            } catch (e) {
                logger.error("panels", `restore failed for ${panel.panelType}`, e.message);
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
        return this.prisma.panel.findMany({ where: { guildId }, orderBy: { panelType: "asc" } });
    }
}
