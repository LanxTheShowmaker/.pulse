import crypto from "node:crypto";
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

const STATUS = { ACTIVE: "ACTIVE", ENDED: "ENDED" };

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export class GiveawayService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
        this._ticking = false;
        this._tickInterval = null;
        this.registerHandlers();
        this._tickInterval = setInterval(() => this.tick().catch(e => logger.error("giveaway", "tick failed", e)), 15_000);
        if (this._tickInterval.unref) this._tickInterval.unref();
    }

    shutdown() {
        if (this._tickInterval) clearInterval(this._tickInterval);
    }

    registerHandlers() {
        const c = this.client.components;

        c.set("giveaway:enter:", async (i) => {
            const giveawayId = i.customId.split(":")[2];
            if (!giveawayId) return i.reply({ embeds: [this.errorEmbed("Invalid giveaway")], flags: MessageFlags.Ephemeral }).catch(() => {});

            const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(() => null);
            if (!giveaway) return i.reply({ embeds: [this.errorEmbed("Giveaway not found")], flags: MessageFlags.Ephemeral }).catch(() => {});
            if (giveaway.status !== STATUS.ACTIVE) return i.reply({ embeds: [this.errorEmbed("This giveaway has ended")], flags: MessageFlags.Ephemeral }).catch(() => {});

            const existing = await this.prisma.giveawayEntry.findUnique({
                where: { giveawayId_userId: { giveawayId, userId: i.user.id } },
            }).catch(() => null);

            if (existing) {
                // Toggle leave
                await this.prisma.giveawayEntry.delete({
                    where: { giveawayId_userId: { giveawayId, userId: i.user.id } },
                }).catch(() => {});
                await this.prisma.giveaway.update({ where: { id: giveawayId }, data: { entryCount: { decrement: 1 } } }).catch(() => {});
                await i.reply({ embeds: [this.infoEmbed("Left", `Removed from **${giveaway.prize}**.`)], flags: MessageFlags.Ephemeral }).catch(() => {});
            } else {
                await this.prisma.giveawayEntry.create({
                    data: { guildId: giveaway.guildId, giveawayId, userId: i.user.id },
                }).catch(() => {});
                await this.prisma.giveaway.update({ where: { id: giveawayId }, data: { entryCount: { increment: 1 } } }).catch(() => {});
                await i.reply({ embeds: [this.successEmbed("Entered", `You're entered to win **${giveaway.prize}**.`)], flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            await this.refreshMessage(giveaway).catch(() => {});
        });
    }

    async create(guild, channel, host, prize, winners, endsAt) {
        const giveawayId = crypto.randomUUID();
        const embed = this.buildEmbed({ id: giveawayId, prize, winners, endsAt, entryCount: 0, hostId: host.id, hostTag: host.tag, status: STATUS.ACTIVE });
        const components = this.buildComponents({ id: giveawayId, status: STATUS.ACTIVE });
        const msg = await channel.send({ embeds: [embed], components });

        const giveaway = await this.prisma.giveaway.create({
            data: {
                guildId: guild.id, channelId: channel.id, messageId: msg.id,
                hostId: host.id, hostTag: host.tag,
                prize, winners, endsAt, status: STATUS.ACTIVE,
            },
        });

        return { giveaway, message: msg };
    }

    async end(giveawayId) {
        const claimed = await this.prisma.giveaway.updateMany({
            where: { id: giveawayId, status: STATUS.ACTIVE },
            data: { status: STATUS.ENDED, ended: true },
        }).catch(() => null);

        if (!claimed || claimed.count !== 1) {
            const g = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(() => null);
            if (!g) return { ok: false, error: "Giveaway not found" };
            if (g.status === STATUS.ENDED) return { ok: false, error: "Already ended" };
            return { ok: false, error: "Could not end" };
        }

        const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
        if (!giveaway) return { ok: false, error: "Not found after claim" };

        const entries = await this.prisma.giveawayEntry.findMany({ where: { giveawayId } }).catch(() => []);
        const eligibleIds = entries.map(e => e.userId);
        const winnerCount = Math.min(giveaway.winners, eligibleIds.length);
        const winnerIds = shuffle(eligibleIds).slice(0, winnerCount);

        await this.prisma.giveaway.update({
            where: { id: giveawayId },
            data: { winnerIds: JSON.stringify(winnerIds) },
        }).catch(e => logger.error("giveaway", "winner store failed", e.message));

        await this.announce(giveaway, winnerIds);
        return { ok: true, winnerIds };
    }

    async reroll(giveawayId, count = 1) {
        const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
        if (!giveaway) return { ok: false, error: "Giveaway not found" };
        if (giveaway.status !== STATUS.ENDED) return { ok: false, error: "Giveaway has not ended yet" };

        const entries = await this.prisma.giveawayEntry.findMany({ where: { giveawayId } }).catch(() => []);
        const previousWinners = JSON.parse(giveaway.winnerIds || "[]");
        const eligible = entries.filter(e => !previousWinners.includes(e.userId));

        const pool = eligible.length > 0 ? eligible : entries;
        if (pool.length === 0) return { ok: false, error: "No entries to reroll" };

        const winnerIds = shuffle(pool).slice(0, Math.min(count, pool.length)).map(e => e.userId);

        await this.prisma.giveaway.update({
            where: { id: giveawayId },
            data: { winnerIds: JSON.stringify([...previousWinners, ...winnerIds]) },
        }).catch(e => logger.error("giveaway", "reroll store failed", e.message));

        await this.announce(giveaway, winnerIds);
        return { ok: true, winnerIds };
    }

    async announce(giveaway, winnerIds) {
        const guild = this.client.guilds.cache.get(giveaway.guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(giveaway.messageId).catch(() => null);

        const mentions = winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(", ") : "No valid entries";
        const embed = this.buildEmbed({ ...giveaway, status: STATUS.ENDED });
        const components = this.buildComponents({ ...giveaway, status: STATUS.ENDED });

        if (msg) {
            await msg.edit({ embeds: [embed], components }).catch(() => {});
        }

        await ch.send({ content: `**Giveaway ended!** Prize: **${giveaway.prize}**\nWinner(s): ${mentions}` }).catch(() => {});
    }

    async refreshMessage(giveaway) {
        const guild = this.client.guilds.cache.get(giveaway.guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(giveaway.messageId).catch(() => null);
        if (!msg) return;

        const fresh = await this.prisma.giveaway.findUnique({ where: { id: giveaway.id } });
        if (!fresh) return;

        await msg.edit({ embeds: [this.buildEmbed(fresh)], components: this.buildComponents(fresh) }).catch(() => {});
    }

    async tick() {
        if (this._ticking) return;
        this._ticking = true;
        try {
            const due = await this.prisma.giveaway.findMany({
                where: { status: STATUS.ACTIVE, endsAt: { lte: new Date() } },
                orderBy: { endsAt: "asc" },
                take: 25,
            }).catch(e => { logger.error("giveaway", "tick query failed", e.message); return []; });

            for (const g of due) {
                const claimed = await this.prisma.giveaway.updateMany({
                    where: { id: g.id, status: STATUS.ACTIVE },
                    data: { status: STATUS.ENDED, ended: true },
                }).catch(() => null);

                if (!claimed || claimed.count !== 1) continue;

                const entries = await this.prisma.giveawayEntry.findMany({ where: { giveawayId: g.id } }).catch(() => []);
                const eligibleIds = entries.map(e => e.userId);
                const winnerCount = Math.min(g.winners, eligibleIds.length);
                const winnerIds = shuffle(eligibleIds).slice(0, winnerCount);

                await this.prisma.giveaway.update({
                    where: { id: g.id },
                    data: { winnerIds: JSON.stringify(winnerIds) },
                }).catch(e => logger.error("giveaway", "tick winner store failed", e.message));

                await this.announce(g, winnerIds);
            }
        } finally {
            this._ticking = false;
        }
    }

    buildEmbed(g) {
        const isActive = g.status === STATUS.ACTIVE;
        return new EmbedBuilder()
            .setColor(isActive ? Theme.gold : Theme.muted)
            .setTitle(isActive ? "Giveaway" : "Giveaway Ended")
            .setDescription(`**${g.prize}**\n\n${g.winners} winner(s) • ${g.entryCount ?? 0} entries`)
            .addFields(
                { name: "Host", value: g.hostTag ? `<@${g.hostId}>` : "Unknown", inline: true },
                { name: "Ends", value: isActive ? `<t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R>` : `<t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R>`, inline: true },
            )
            .setFooter({ text: Brand.footer })
            .setTimestamp();
    }

    buildComponents(g) {
        const isActive = g.status === STATUS.ACTIVE;
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway:enter:${g.id}`)
                .setLabel(isActive ? "Enter Giveaway" : "Ended")
                .setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(!isActive),
        )];
    }

    errorEmbed(msg) { return new EmbedBuilder().setColor(Theme.danger).setDescription(msg).setFooter({ text: Brand.footer }); }
    successEmbed(title, msg) { return new EmbedBuilder().setColor(Theme.success).setTitle(title).setDescription(msg).setFooter({ text: Brand.footer }); }
    infoEmbed(title, msg) { return new EmbedBuilder().setColor(Theme.info).setTitle(title).setDescription(msg).setFooter({ text: Brand.footer }); }
}
