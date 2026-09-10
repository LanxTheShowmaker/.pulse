import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class SuggestionService {
    prisma; client;
    constructor(prisma, client) { this.prisma = prisma; this.client = client; this.register(); }
    register() {
        this.client.components.set("suggest:up", async (i) => {
            const mid = i.customId.split(":")[2];
            await i.reply({ content: "Upvoted!", flags: MessageFlags.Ephemeral }).catch(() => {});
        });
        this.client.components.set("suggest:approve", async (i) => {
            if (!i.member.permissions.has("ManageGuild")) return i.reply({ content: "No perm.", flags: MessageFlags.Ephemeral }).catch(() => {});
            const mid = i.customId.split(":")[2];
            await this.prisma.suggestion.update({ where: { messageId: mid }, data: { status: "APPROVED" } }).catch(() => {});
            await i.reply({ content: "Approved.", flags: MessageFlags.Ephemeral }).catch(() => {});
        });
        this.client.components.set("suggest:deny", async (i) => {
            if (!i.member.permissions.has("ManageGuild")) return;
            const mid = i.customId.split(":")[2];
            await this.prisma.suggestion.update({ where: { messageId: mid }, data: { status: "DENIED" } }).catch(() => {});
            await i.reply({ content: "Denied.", flags: MessageFlags.Ephemeral }).catch(() => {});
        });
    }
    async create(guild, channel, author, content) {
        const embed = new EmbedBuilder().setColor(Theme.info).setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() }).setTitle("Suggestion").setDescription(content).setFooter({ text: `by ${author.tag}` }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`suggest:up:${Date.now()}`).setLabel("Upvote").setStyle(ButtonStyle.Secondary).setEmoji("👍"),
            new ButtonBuilder().setCustomId(`suggest:approve:${Date.now()}`).setLabel("Approve").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`suggest:deny:${Date.now()}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
        );
        const msg = await channel.send({ embeds: [embed], components: [row] });
        // fix customIds with real messageId
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`suggest:up:${msg.id}`).setLabel("Upvote").setStyle(ButtonStyle.Secondary).setEmoji("👍"),
            new ButtonBuilder().setCustomId(`suggest:approve:${msg.id}`).setLabel("Approved").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`suggest:deny:${msg.id}`).setLabel("Denied").setStyle(ButtonStyle.Danger),
        );
        await msg.edit({ components: [row2] }).catch(() => {});
        await this.prisma.suggestion.create({ data: { guildId: guild.id, channelId: channel.id, messageId: msg.id, authorId: author.id, content } });
        return msg;
    }
}