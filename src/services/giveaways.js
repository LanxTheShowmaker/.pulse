import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class GiveawayService {
    prisma; client; _ticking = false;
    constructor(prisma, client) { this.prisma = prisma; this.client = client; this.register(); this.tick(); this._tickInterval = setInterval(() => this.tick().catch(e => logger.error("giveaway", "tick", e)), 15000); if (this._tickInterval.unref) this._tickInterval.unref(); }
    register() {
        this.client.components.set("giveaway:enter", async (i) => {
            await i.reply({ content: "Entered — good luck!", flags: MessageFlags.Ephemeral }).catch(() => {});
        });
    }
    async create(guild, channel, prize, winners, endsAt) {
        const embed = new EmbedBuilder().setColor(Theme.gold).setTitle(`Giveaway — ${prize}`).setDescription(`React 🎉 to enter • Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>\nWinners: **${winners}**`).setFooter({ text: Brand.name }).setTimestamp(endsAt);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("giveaway:enter").setLabel("Enter").setStyle(ButtonStyle.Primary));
        const msg = await channel.send({ embeds: [embed], components: [row] });
        await msg.react("🎉").catch(() => {});
        await this.prisma.giveaway.create({ data: { guildId: guild.id, channelId: channel.id, messageId: msg.id, prize, winners, endsAt } });
        return msg;
    }
    async _endStale(id, reason, extra={}) {
        try{
            await this.prisma.giveaway.updateMany({ where: { id, ended: false }, data: { ended: true } });
        }catch(e){ logger.error("giveaway", "stale mark failed", { id, error: e }); return; }
        logger.warn?.("giveaway", `giveaway ${id} ended as stale: ${reason}`, extra);
    }
    async tick() {
        if (this._ticking) return;
        this._ticking = true;
        try {
        const due = await this.prisma.giveaway.findMany({ where: { ended: false, endsAt: { lte: new Date() } }, orderBy: { endsAt: "asc" }, take: 50 }).catch(() => []);
        for (const g of due) {
            try {
                const guild = this.client.guilds.cache.get(g.guildId) ?? await this.client.guilds.fetch(g.guildId).catch((e) => { logger.error("giveaway", "guild fetch failed", { id: g.id, error: e }); return null; });
                if (!guild){ await this._endStale(g.id, "guild missing", { guildId: g.guildId }); continue; }
                const ch = guild.channels.cache.get(g.channelId) ?? await guild.channels.fetch(g.channelId).catch((e) => { logger.error("giveaway", "channel fetch failed", { id: g.id, error: e }); return null; });
                if (!ch || !ch.isTextBased()){ await this._endStale(g.id, "channel missing or not text", { channelId: g.channelId }); continue; }
                const msg = await ch.messages.fetch(g.messageId).catch((e) => { logger.error("giveaway", "message fetch failed", { id: g.id, error: e }); return null; });
                if (!msg){ await this._endStale(g.id, "message missing", { messageId: g.messageId }); continue; }
                const reaction = msg.reactions.cache.get("🎉");
                const users = reaction ? await reaction.users.fetch().catch((e) => { logger.error("giveaway", "reaction fetch failed", { id: g.id, error: e }); return null; }) : null;
                const ids = users ? [...users.values()].filter(u => !u.bot).map(u => u.id) : [];
                const winners = ids.sort(() => 0.5 - Math.random()).slice(0, g.winners);
                const claimed = await this.prisma.giveaway.updateMany({ where: { id: g.id, ended: false }, data: { ended: true } }).catch((e) => { logger.error("giveaway", "claim failed", { id: g.id, error: e }); return null; });
                if (!claimed || claimed.count !== 1) continue;
                await ch.send({ embeds: [new EmbedBuilder().setColor(Theme.success).setTitle("Giveaway Ended").setDescription(`**${g.prize}** — Winners: ${winners.length ? winners.map(id => `<@${id}>`).join(", ") : "No entries"}`)], }).catch((e) => { logger.error("giveaway", "announce failed", { id: g.id, error: e }); });
            } catch (e) { logger.error("giveaway", "end failed", e); }
        }
        } finally { this._ticking = false; }
    }
    shutdown() {
        if (this._tickInterval) clearInterval(this._tickInterval);
    }
}
