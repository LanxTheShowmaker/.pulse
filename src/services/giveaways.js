import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "giveaways.json");

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export class GiveawayService {
    constructor(_prisma, client) {
        this.client = client;
        this.giveaways = {};
        this._ticking = false;
        this._tickInterval = null;
        this._dirty = false;
        this._saveInterval = null;
        this.load();
        this._tickInterval = setInterval(() => this.tick().catch(e => logger.error("giveaway", "tick failed", e)), 15_000);
        this._saveInterval = setInterval(() => this.save().catch(() => {}), 30_000);
        if (this._tickInterval.unref) this._tickInterval.unref();
        if (this._saveInterval.unref) this._saveInterval.unref();
    }

    shutdown() {
        if (this._tickInterval) clearInterval(this._tickInterval);
        if (this._saveInterval) clearInterval(this._saveInterval);
        this.save().catch(() => {});
    }

    async load() {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            const raw = await fs.readFile(FILE, "utf-8");
            this.giveaways = JSON.parse(raw);
            logger.info("giveaway", `loaded ${Object.keys(this.giveaways).length} giveaway(s)`);
        } catch {
            this.giveaways = {};
        }
    }

    async save() {
        if (!this._dirty) return;
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            await fs.writeFile(FILE, JSON.stringify(this.giveaways, null, 2));
            this._dirty = false;
        } catch (e) {
            logger.error("giveaway", "save failed", e.message);
        }
    }

    markDirty() {
        this._dirty = true;
    }

    async create(guild, channel, host, prize, winners, endsAt) {
        const id = crypto.randomUUID();
        const g = {
            id,
            guildId: guild.id,
            channelId: channel.id,
            messageId: null,
            hostId: host.id,
            hostTag: host.tag,
            prize,
            winners,
            endsAt: endsAt.toISOString(),
            status: "ACTIVE",
            entryCount: 0,
            entries: [],
            winnerIds: [],
        };

        const embed = this.buildEmbed(g);
        const components = this.buildComponents(g);
        const msg = await channel.send({ embeds: [embed], components });
        g.messageId = msg.id;

        this.giveaways[id] = g;
        this.markDirty();
        await this.save();

        return { giveaway: g, message: msg };
    }

    findByMessageId(messageId) {
        return Object.values(this.giveaways).find(g => g.messageId === messageId) || null;
    }

    listByGuild(guildId, status, limit = 10) {
        return Object.values(this.giveaways)
            .filter(g => g.guildId === guildId && (!status || g.status === status))
            .sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt))
            .slice(0, limit);
    }

    async end(giveawayId) {
        const g = this.giveaways[giveawayId];
        if (!g) return { ok: false, error: "Giveaway not found" };
        if (g.status === "ENDED") return { ok: false, error: "Already ended" };

        g.status = "ENDED";
        g.ended = true;
        this.markDirty();

        const eligibleIds = g.entries || [];
        const winnerCount = Math.min(g.winners, eligibleIds.length);
        g.winnerIds = shuffle(eligibleIds).slice(0, winnerCount);

        await this.save();
        await this.announce(g);
        return { ok: true, winnerIds: g.winnerIds };
    }

    async reroll(giveawayId, count = 1) {
        const g = this.giveaways[giveawayId];
        if (!g) return { ok: false, error: "Giveaway not found" };
        if (g.status !== "ENDED") return { ok: false, error: "Giveaway has not ended yet" };

        const previousWinners = g.winnerIds || [];
        const eligible = (g.entries || []).filter(id => !previousWinners.includes(id));

        const pool = eligible.length > 0 ? eligible : (g.entries || []);
        if (pool.length === 0) return { ok: false, error: "No entries to reroll" };

        const winnerIds = shuffle(pool).slice(0, Math.min(count, pool.length));
        g.winnerIds = [...previousWinners, ...winnerIds];

        this.markDirty();
        await this.save();
        await this.announce(g, winnerIds);
        return { ok: true, winnerIds };
    }

    async announce(g, newWinners = null) {
        const guild = this.client.guilds.cache.get(g.guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(g.channelId) ?? await guild.channels.fetch(g.channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(g.messageId).catch(() => null);

        const embed = this.buildEmbed(g);
        const components = this.buildComponents(g);

        if (msg) await msg.edit({ embeds: [embed], components }).catch(() => {});

        const winnerIds = newWinners ?? g.winnerIds ?? [];
        const mentions = winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(", ") : "No valid entries";
        await ch.send({ content: `**Giveaway ended!** Prize: **${g.prize}**\nWinner(s): ${mentions}` }).catch(() => {});
    }

    async refreshMessage(g) {
        const guild = this.client.guilds.cache.get(g.guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(g.channelId) ?? await guild.channels.fetch(g.channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(g.messageId).catch(() => null);
        if (!msg) return;
        await msg.edit({ embeds: [this.buildEmbed(g)], components: this.buildComponents(g) }).catch(() => {});
    }

    async tick() {
        if (this._ticking) return;
        this._ticking = true;
        try {
            const now = Date.now();
            for (const g of Object.values(this.giveaways)) {
                if (g.status !== "ACTIVE") continue;
                if (new Date(g.endsAt).getTime() > now) continue;

                g.status = "ENDED";
                g.ended = true;

                const eligibleIds = g.entries || [];
                const winnerCount = Math.min(g.winners, eligibleIds.length);
                g.winnerIds = shuffle(eligibleIds).slice(0, winnerCount);

                this.markDirty();
                await this.announce(g).catch(e => logger.error("giveaway", `announce failed for ${g.id}`, e.message));
            }
            await this.save();
        } finally {
            this._ticking = false;
        }
    }

    buildEmbed(g) {
        const isActive = g.status === "ACTIVE";
        return new EmbedBuilder()
            .setColor(isActive ? Theme.gold : Theme.muted)
            .setTitle(isActive ? "Giveaway" : "Giveaway Ended")
            .setDescription(`**${g.prize}**\n\n${g.winners} winner(s) • ${g.entryCount ?? 0} entries`)
            .addFields(
                { name: "Host", value: g.hostId ? `<@${g.hostId}>` : "Unknown", inline: true },
                { name: "Ends", value: `<t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R>`, inline: true },
            )
            .setFooter({ text: Brand.footer })
            .setTimestamp();
    }

    buildComponents(g) {
        const isActive = g.status === "ACTIVE";
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
