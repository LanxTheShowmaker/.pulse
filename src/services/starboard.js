import { EmbedBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, MediaGalleryBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { logger } from "../core/logger.js";
import { Theme, Brand } from "../design/theme.js";
const POSTED_CAP = 1000;
const POSTED_TTL = 7*24*3600*1000;

export class StarboardService {
    prisma;
    client;
    posted = new Map(); // source messageId -> { starId, channelId, at }
    constructor(prisma, client) { this.prisma = prisma; this.client = client; }

    _remember(sourceId, starId, channelId){
        if(this.posted.size >= POSTED_CAP){
            const oldest = this.posted.keys().next().value;
            if(oldest) this.posted.delete(oldest);
        }
        this.posted.set(sourceId, { starId, channelId, at: Date.now() });
    }
    _lookup(sourceId){
        const e = this.posted.get(sourceId);
        if(!e) return null;
        if(Date.now()-e.at > POSTED_TTL){ this.posted.delete(sourceId); return null; }
        return e;
    }
    _buildContainer(msg, count, avatarUrl, content, imageUrl){
        const container = new ContainerBuilder()
            .addComponents(
                new SectionBuilder()
                    .addComponents(
                        new TextDisplayBuilder().setContent(`## Starred Message`)
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
        return container;
    }

    async handleReactionAdd(reaction, user) {
        if (!this.client?.services?.starboard) return;
        if (user?.bot) return;

        const msg = reaction?.message;
        if (!msg?.guild) return;

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (e) {
                logger.error("starboard", "reaction fetch failed", e);
                return;
            }
        }

        const cfg = await this.prisma.starboardConfig.findUnique({ where: { guildId: msg.guild.id } }).catch((e) => { logger.error("starboard", "config lookup failed", e); return null; });
        if (!cfg) return;

        const emojiName = reaction.emoji?.name;
        if (emojiName !== cfg.emoji) return;

        const count = reaction.count ?? 1;
        if (count < cfg.threshold) return;

        const ch = msg.guild.channels.cache.get(cfg.channelId) ?? await msg.guild.channels.fetch(cfg.channelId).catch((e) => { logger.error("starboard", "channel fetch failed", e); return null; });
        if (!ch || !ch.isTextBased()) return;

        const author = msg.author;
        const avatarUrl = author.displayAvatarURL({ size: 64 });
        const content = msg.content?.slice(0, 4000) || "[image]";
        const imageUrl = msg.attachments.first()?.url;

        const container = this._buildContainer(msg, count, avatarUrl, content, imageUrl);

        const existing = this._lookup(msg.id);
        if(existing){
            try{
                const starCh = msg.guild.channels.cache.get(existing.channelId) ?? await msg.guild.channels.fetch(existing.channelId).catch(()=>null);
                const starMsg = starCh?.isTextBased() ? await starCh.messages.fetch(existing.starId).catch(()=>null) : null;
                if(starMsg?.editable ?? starMsg){
                    await starMsg.edit({ components: [container] }).catch(e => logger.error("starboard", "edit", e));
                    this.posted.set(msg.id, { ...existing, at: Date.now() });
                    return;
                }
            }catch(e){ logger.error("starboard", "update failed", e); }
            this.posted.delete(msg.id);
        }
        try{
            const sent = await ch.send({ components: [container] });
            this._remember(msg.id, sent.id, ch.id);
        }catch(e){ logger.error("starboard", "send", e); }
    }
}
