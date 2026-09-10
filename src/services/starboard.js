import { EmbedBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, MediaGalleryBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { logger } from "../core/logger.js";
import { Theme, Brand } from "../design/theme.js";

export class StarboardService {
    prisma;
    client;
    constructor(prisma, client) { this.prisma = prisma; this.client = client; }

    async handleReactionAdd(reaction, user) {
        if (!this.client?.services?.starboard) return;
        if (user?.bot) return;
        
        const msg = reaction?.message;
        if (!msg?.guild) return;
        
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }
        
        const cfg = await this.prisma.starboardConfig.findUnique({ where: { guildId: msg.guild.id } }).catch(() => null);
        if (!cfg) return;
        
        const emojiName = reaction.emoji?.name;
        if (emojiName !== cfg.emoji) return;
        
        const count = reaction.count ?? 1;
        if (count < cfg.threshold) return;
        
        const ch = msg.guild.channels.cache.get(cfg.channelId) ?? await msg.guild.channels.fetch(cfg.channelId).catch(() => null);
        if (!ch || !ch.isTextBased()) return;
        
        const author = msg.author;
        const avatarUrl = author.displayAvatarURL({ size: 64 });
        const content = msg.content?.slice(0, 4000) || "[image]";
        const imageUrl = msg.attachments.first()?.url;
        
        const container = new ContainerBuilder()
            .addComponents(
                new SectionBuilder()
                    .addComponents(
                        new TextDisplayBuilder().setContent(`## ${Brand.mark} Starred Message`)
                    )
                    .setAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addComponents(new SeparatorBuilder().setDivider(true))
            .addComponents(new TextDisplayBuilder().setContent(content))
            .addComponents(new SeparatorBuilder().setDivider(true))
            .addComponents(
                new TextDisplayBuilder().setContent(`-# ⭐ ${count} · #${msg.channel.name} · [Jump to message](${msg.url})`)
            );
        
        if (imageUrl) {
            container.addComponents(new MediaGalleryBuilder().addItems([{ media: { url: imageUrl } }]));
        }
        
        await ch.send({ components: [container] }).catch(e => logger.error("starboard", "send", e));
    }
}
