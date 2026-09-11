import { EmbedBuilder, ButtonBuilder, ActionRowBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

const STATUS = { ACTIVE: "ACTIVE", ENDED: "ENDED" };

export class GiveawayService {
    prisma;
    client;
    _ticking = false;
    _tickInterval = null;
    _recovered = false;

    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
        this.registerHandlers();
        this._tickInterval = setInterval(() => this.tick().catch(e => logger.error("giveaway", "tick failed", e)), 15_000);
        if (this._tickInterval.unref) this._tickInterval.unref();
    }

    shutdown() {
        if (this._tickInterval) clearInterval(this._tickInterval);
    }

    // ─── Component Handlers ────────────────────────────────

    registerHandlers() {
        const c = this.client.components;

        c.set("giveaway:enter", async (i) => {
            const giveawayId = i.customId.split(":")[2];
            if (!giveawayId) return i.reply({ embeds: [this.errorEmbed("Invalid giveaway")], flags: MessageFlags.Ephemeral }).catch(() => {});
            const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(() => null);
            if (!giveaway) return i.reply({ embeds: [this.errorEmbed("Giveaway not found")], flags: MessageFlags.Ephemeral }).catch(() => {});
            if (giveaway.status !== STATUS.ACTIVE) return i.reply({ embeds: [this.errorEmbed("This giveaway has ended")], flags: MessageFlags.Ephemeral }).catch(() => {});
            if (giveaway.guildId !== i.guild.id) return i.reply({ embeds: [this.errorEmbed("Wrong server")], flags: MessageFlags.Ephemeral }).catch(() => {});

            const result = await this.enter(giveaway.id, i.user.id);
            if (result.ok) {
                await i.reply({ embeds: [this.successEmbed("Entered", `You're now entered to win **${giveaway.prize}**.`)], flags: MessageFlags.Ephemeral }).catch(() => {});
                await this.refreshMessage(giveaway).catch(() => {});
            } else if (result.already) {
                // User clicked again — treat as leave
                const left = await this.leave(giveaway.id, i.user.id);
                if (left.ok) {
                    await i.reply({ embeds: [this.infoEmbed("Left", `You've been removed from **${giveaway.prize}**.`)], flags: MessageFlags.Ephemeral }).catch(() => {});
                    await this.refreshMessage(giveaway).catch(() => {});
                } else {
                    await i.reply({ embeds: [this.errorEmbed(left.error || "Could not leave")], flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            } else {
                await i.reply({ embeds: [this.errorEmbed(result.error || "Could not enter")], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        });
    }

    // ─── Entry Management ──────────────────────────────────

    async enter(giveawayId, userId) {
        try {
            const existing = await this.prisma.giveawayEntry.findUnique({
                where: { giveawayId_userId: { giveawayId, userId } },
            });
            if (existing) return { ok: false, already: true };

            // Atomic: create entry + increment count
            await this.prisma.giveawayEntry.create({
                data: { guildId: (await this.prisma.giveaway.findUnique({ where: { id: giveawayId }, select: { guildId: true } })).guildId, giveawayId, userId },
            });
            await this.prisma.giveaway.update({
                where: { id: giveawayId },
                data: { entryCount: { increment: 1 } },
            });
            return { ok: true };
        } catch (e) {
            // Unique constraint violation = already entered
            if (e.code === "P2002") return { ok: false, already: true };
            logger.error("giveaway", "enter failed", { giveawayId, userId, error: e });
            return { ok: false, error: "Database error" };
        }
    }

    async leave(giveawayId, userId) {
        try {
            const deleted = await this.prisma.giveawayEntry.deleteMany({
                where: { giveawayId, userId },
            });
            if (deleted.count === 0) return { ok: false, error: "You're not entered" };
            await this.prisma.giveaway.update({
                where: { id: giveawayId },
                data: { entryCount: { decrement: 1 } },
            });
            return { ok: true };
        } catch (e) {
            logger.error("giveaway", "leave failed", { giveawayId, userId, error: e });
            return { ok: false, error: "Database error" };
        }
    }

    // ─── Giveaway Creation ─────────────────────────────────

    async create(guild, channel, prize, winners, durationMs, host) {
        const endsAt = new Date(Date.now() + durationMs);

        // Validate channel permissions
        const me = guild.members.me;
        const perms = channel.permissionsFor(me);
        if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks") || !perms?.has("AddReactions")) {
            throw new Error("Bot missing SendMessages/EmbedLinks/AddReactions in that channel");
        }

        // Build and send the giveaway message first
        const giveawayId = crypto.randomUUID();
        const embed = this.buildEmbed({ id: giveawayId, prize, winners, endsAt, entryCount: 0, hostId: host.id, hostTag: host.user.tag, status: STATUS.ACTIVE });
        const components = this.buildComponents({ id: giveawayId, status: STATUS.ACTIVE });
        const msg = await channel.send({ embeds: [embed], components });

        // Persist after Discord message succeeds
        const giveaway = await this.prisma.giveaway.create({
            data: {
                guildId: guild.id,
                channelId: channel.id,
                messageId: msg.id,
                hostId: host.id,
                hostTag: host.user.tag,
                prize,
                winners,
                endsAt,
                status: STATUS.ACTIVE,
            },
        });

        logger.info("giveaway", `created: ${giveaway.id} in ${guild.id} by ${host.id}`);
        return { giveaway, message: msg };
    }

    // ─── Ending ────────────────────────────────────────────

    async end(giveawayId, endedBy = null) {
        // Atomic claim — only one process can end this giveaway
        const claimed = await this.prisma.giveaway.updateMany({
            where: { id: giveawayId, status: STATUS.ACTIVE },
            data: { status: STATUS.ENDED },
        }).catch(() => null);

        if (!claimed || claimed.count !== 1) {
            // Already ended or not found
            const g = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(() => null);
            if (!g) return { ok: false, error: "Giveaway not found" };
            if (g.status === STATUS.ENDED) return { ok: false, error: "Giveaway already ended" };
            return { ok: false, error: "Could not end giveaway" };
        }

        const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
        if (!giveaway) return { ok: false, error: "Giveaway not found after claim" };

        // Select winners from DB entries
        const entries = await this.prisma.giveawayEntry.findMany({
            where: { giveawayId },
        }).catch(() => []);

        const eligibleIds = entries.map(e => e.userId);
        const winnerCount = Math.min(giveaway.winners, eligibleIds.length);
        const shuffled = [...eligibleIds].sort(() => Math.random() - 0.5);
        const winnerIds = shuffled.slice(0, winnerCount);

        // Store winners
        await this.prisma.giveaway.update({
            where: { id: giveawayId },
            data: { winnerIds: JSON.stringify(winnerIds) },
        }).catch(() => {});

        // Update the original message
        await this.updateMessage(giveaway, winnerIds).catch(() => {});

        // Announce in channel
        const guild = this.client.guilds.cache.get(giveaway.guildId);
        if (guild) {
            const ch = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
            if (ch?.isTextBased()) {
                const announceEmbed = this.buildEndedEmbed(giveaway, winnerIds);
                await ch.send({ embeds: [announceEmbed] }).catch(e => logger.error("giveaway", "announce failed", e));
            }
        }

        logger.info("giveaway", `ended: ${giveawayId}, ${winnerIds.length} winners from ${eligibleIds.length} entries`);
        return { ok: true, winnerIds, entryCount: eligibleIds.length };
    }

    // ─── Reroll ────────────────────────────────────────────

    async reroll(giveawayId, count = 1) {
        const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
        if (!giveaway) return { ok: false, error: "Giveaway not found" };
        if (giveaway.status !== STATUS.ENDED) return { ok: false, error: "Giveaway has not ended yet" };

        const entries = await this.prisma.giveawayEntry.findMany({ where: { giveawayId } }).catch(() => []);
        if (entries.length === 0) return { ok: false, error: "No entries to reroll from" };

        const currentWinners = (() => { try { return JSON.parse(giveaway.winnerIds ?? "[]"); } catch { return []; } })();
        // Filter out current winners for fresh selection
        const eligible = entries.filter(e => !currentWinners.includes(e.userId));
        if (eligible.length === 0) {
            // If all entries are current winners, allow re-selection from all
            const shuffled = [...entries].sort(() => Math.random() - 0.5);
            const newWinners = shuffled.slice(0, Math.min(count, entries.length)).map(e => e.userId);
            await this.prisma.giveaway.update({
                where: { id: giveawayId },
                data: { winnerIds: JSON.stringify(newWinners) },
            });
            await this.updateMessage(giveaway, newWinners).catch(() => {});
            return { ok: true, winnerIds: newWinners };
        }

        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        const newWinners = shuffled.slice(0, Math.min(count, eligible.length)).map(e => e.userId);
        const allWinners = [...currentWinners, ...newWinners];
        await this.prisma.giveaway.update({
            where: { id: giveawayId },
            data: { winnerIds: JSON.stringify(allWinners) },
        });
        await this.updateMessage(giveaway, allWinners).catch(() => {});
        return { ok: true, winnerIds: newWinners };
    }

    // ─── Query ─────────────────────────────────────────────

    async get(giveawayId) {
        return this.prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(() => null);
    }

    async getByMessage(messageId) {
        return this.prisma.giveaway.findUnique({ where: { messageId } }).catch(() => null);
    }

    async list(guildId, status = STATUS.ACTIVE) {
        return this.prisma.giveaway.findMany({
            where: { guildId, status },
            orderBy: { endsAt: "asc" },
            take: 25,
        }).catch(() => []);
    }

    // ─── Tick (Scheduler) ──────────────────────────────────

    async tick() {
        if (this._ticking) return;
        this._ticking = true;
        try {
            // Process expired giveaways
            const due = await this.prisma.giveaway.findMany({
                where: { status: STATUS.ACTIVE, endsAt: { lte: new Date() } },
                orderBy: { endsAt: "asc" },
                take: 25,
            }).catch(() => []);

            for (const g of due) {
                await this.processGiveaway(g).catch(e => logger.error("giveaway", `process failed: ${g.id}`, e));
            }

            // Startup recovery — run once
            if (!this._recovered) {
                this._recovered = true;
                await this.recoverActive();
            }
        } finally {
            this._ticking = false;
        }
    }

    async processGiveaway(giveaway) {
        // Try to claim ending rights
        const claimed = await this.prisma.giveaway.updateMany({
            where: { id: giveaway.id, status: STATUS.ACTIVE },
            data: { status: STATUS.ENDED },
        }).catch(() => null);

        if (!claimed || claimed.count !== 1) return; // Another process already ended it

        // Select winners from DB entries
        const entries = await this.prisma.giveawayEntry.findMany({
            where: { giveawayId: giveaway.id },
        }).catch(() => []);

        const eligibleIds = entries.map(e => e.userId);
        const winnerCount = Math.min(giveaway.winners, eligibleIds.length);
        const shuffled = [...eligibleIds].sort(() => Math.random() - 0.5);
        const winnerIds = shuffled.slice(0, winnerCount);

        await this.prisma.giveaway.update({
            where: { id: giveaway.id },
            data: { winnerIds: JSON.stringify(winnerIds) },
        }).catch(() => {});

        // Update original message
        await this.updateMessage(giveaway, winnerIds).catch(() => {});

        // Announce
        const guild = this.client.guilds.cache.get(giveaway.guildId);
        if (guild) {
            const ch = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
            if (ch?.isTextBased()) {
                const embed = this.buildEndedEmbed(giveaway, winnerIds);
                await ch.send({ embeds: [embed] }).catch(e => logger.error("giveaway", "announce failed", e));
            }
        }

        logger.info("giveaway", `auto-ended: ${giveaway.id}, ${winnerIds.length} winners`);
    }

    // ─── Startup Recovery ──────────────────────────────────

    async recoverActive() {
        try {
            const expired = await this.prisma.giveaway.findMany({
                where: { status: STATUS.ACTIVE, endsAt: { lte: new Date() } },
                take: 50,
            });
            if (expired.length > 0) {
                logger.info("giveaway", `recovering ${expired.length} expired giveaways`);
                for (const g of expired) {
                    await this.processGiveaway(g).catch(e => logger.error("giveaway", `recovery failed: ${g.id}`, e));
                }
            }

            // Log active count
            const activeCount = await this.prisma.giveaway.count({
                where: { status: STATUS.ACTIVE },
            });
            if (activeCount > 0) {
                logger.info("giveaway", `${activeCount} active giveaways scheduled`);
            }
        } catch (e) {
            logger.error("giveaway", "recovery failed", e);
        }
    }

    // ─── Message Building ──────────────────────────────────

    buildEmbed(g) {
        const hostText = g.hostId ? `Hosted by <@${g.hostId}>` : "";
        const entryText = `**${g.entryCount ?? 0}** entries`;
        const winnersText = `**${g.winners}** winner${g.winners === 1 ? "" : "s"}`;
        const description = [
            `Prize: **${g.prize}**`,
            `Ends: <t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R>`,
            `Winners: ${winnersText}`,
            entryText,
            hostText,
        ].filter(Boolean).join("\n");

        return new EmbedBuilder()
            .setColor(g.status === STATUS.ACTIVE ? Theme.gold : Theme.muted)
            .setTitle(g.status === STATUS.ACTIVE ? "Giveaway" : "Giveaway Ended")
            .setDescription(description)
            .setFooter({ text: Brand.footer })
            .setTimestamp(new Date(g.endsAt));
    }

    buildComponents(g) {
        if (g.status !== STATUS.ACTIVE) {
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`giveaway:enter:${g.id}`).setLabel("Ended").setStyle(ButtonStyle.Secondary).setDisabled(true),
            )];
        }
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`giveaway:enter:${g.id}`).setLabel("Enter Giveaway").setStyle(ButtonStyle.Primary),
        )];
    }

    buildEndedEmbed(g, winnerIds) {
        const winners = winnerIds.length
            ? winnerIds.map(id => `<@${id}>`).join(", ")
            : "No valid entries";
        return new EmbedBuilder()
            .setColor(Theme.success)
            .setTitle("Giveaway Ended")
            .setDescription(`**${g.prize}**\n\nWinner${winnerIds.length === 1 ? "" : "s"}: ${winners}\nEntries: **${g.entryCount ?? 0}**`)
            .setFooter({ text: Brand.footer })
            .setTimestamp();
    }

    // ─── Message Updates ───────────────────────────────────

    async updateMessage(giveaway, winnerIds) {
        const guild = this.client.guilds.cache.get(giveaway.guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(giveaway.messageId).catch(() => null);
        if (!msg) return;

        const embed = this.buildEmbed({ ...giveaway, winnerIds: JSON.stringify(winnerIds) });
        const components = this.buildComponents({ ...giveaway, status: STATUS.ENDED });
        await msg.edit({ embeds: [embed], components }).catch(() => {});
    }

    async refreshMessage(giveaway) {
        const guild = this.client.guilds.cache.get(giveaway.guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(giveaway.messageId).catch(() => null);
        if (!msg) return;

        // Re-fetch fresh data
        const fresh = await this.prisma.giveaway.findUnique({ where: { id: giveaway.id } });
        if (!fresh) return;

        const embed = this.buildEmbed(fresh);
        const components = this.buildComponents(fresh);
        await msg.edit({ embeds: [embed], components }).catch(() => {});
    }

    // ─── Helpers ───────────────────────────────────────────

    successEmbed(title, description) {
        return new EmbedBuilder().setColor(Theme.success).setTitle(title).setDescription(description).setFooter({ text: Brand.footer });
    }

    errorEmbed(description) {
        return new EmbedBuilder().setColor(Theme.danger).setTitle("Error").setDescription(description).setFooter({ text: Brand.footer });
    }

    infoEmbed(title, description) {
        return new EmbedBuilder().setColor(Theme.info).setTitle(title).setDescription(description).setFooter({ text: Brand.footer });
    }
}
