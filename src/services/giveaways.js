import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class GiveawayService {
    prisma; client;
    constructor(prisma, client) { this.prisma = prisma; this.client = client; this.register(); this.tick(); setInterval(() => this.tick().catch(e => logger.error("giveaway", "tick", e)), 15000); }
    register() {
        this.client.components.set("giveaway:enter", async (i) => {
            await i.reply({ content: "Entered — good luck!", flags: MessageFlags.Ephemeral }).catch(() => {});
        });
    }
    async create(guild, channel, prize, winners, endsAt) {
        const embed = new EmbedBuilder().setColor(Theme.gold).setTitle(`Giveaway — ${prize}`).setDescription(`React 🎉 to enter • Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>\nWinners: **${winners}**`).setFooter({ text: `${Brand.name} • Giveaways` }).setTimestamp(endsAt);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("giveaway:enter").setLabel("Enter 🎉").setStyle(ButtonStyle.Primary));
        const msg = await channel.send({ embeds: [embed], components: [row] });
        await msg.react("🎉").catch(() => {});
        await this.prisma.giveaway.create({ data: { guildId: guild.id, channelId: channel.id, messageId: msg.id, prize, winners, endsAt } });
        return msg;
    }
    async tick() {
        const due = await this.prisma.giveaway.findMany({ where: { ended: false, endsAt: { lte: new Date() } } }).catch(() => []);
        for (const g of due) {
            try {
                const guild = this.client.guilds.cache.get(g.guildId) ?? await this.client.guilds.fetch(g.guildId).catch(() => null);
                if (!guild) continue;
                const ch = guild.channels.cache.get(g.channelId) ?? await guild.channels.fetch(g.channelId).catch(() => null);
                if (!ch || !ch.isTextBased()) continue;
                const msg = await ch.messages.fetch(g.messageId).catch(() => null);
                if (!msg) continue;
                const reaction = msg.reactions.cache.get("🎉");
                const users = reaction ? await reaction.users.fetch().catch(() => null) : null;
                const ids = users ? [...users.values()].filter(u => !u.bot).map(u => u.id) : [];
                const winners = ids.sort(() => 0.5 - Math.random()).slice(0, g.winners);
                await ch.send({ embeds: [new EmbedBuilder().setColor(Theme.success).setTitle("Giveaway Ended").setDescription(`**${g.prize}** — Winners: ${winners.length ? winners.map(id => `<@${id}>`).join(", ") : "No entries"}`)], }).catch(() => {});
                await this.prisma.giveaway.update({ where: { id: g.id }, data: { ended: true } });
            } catch (e) { logger.error("giveaway", "end failed", e); }
        }
    }
}
