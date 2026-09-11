import { ButtonBuilder, ActionRowBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { logger } from "../core/logger.js";
import { embeds } from "../design/embeds.js";
const POLL_VOTERS_CAP = 1000;

export class UtilityService {
    prisma;
    client;
    pollVoters = new Map();
    interval;
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
        this.interval = setInterval(() => {
            this.tickReminders().catch((e) => logger.error("utility", "reminder tick failed", e));
        }, 15000);
        if(this.interval?.unref) this.interval.unref();
        this.client.components.set("poll:vote", async (interaction) => {
            await this.handlePollVote(interaction).catch((e) => logger.error("utility", "poll vote failed", e));
        });
        process.once("beforeExit", () => clearInterval(this.interval));
    }
    shutdown(){ if(this.interval) clearInterval(this.interval); this.interval=null; }
    _trackPollVoter(messageId, userId){
        let voters = this.pollVoters.get(messageId);
        if (!voters) {
            voters = new Set();
            if(this.pollVoters.size >= POLL_VOTERS_CAP){
                const oldest = this.pollVoters.keys().next().value;
                if(oldest) this.pollVoters.delete(oldest);
            }
            this.pollVoters.set(messageId, voters);
        }
        return voters;
    }
    async tickReminders() {
        let due = [];
        try {
            due = await this.prisma.reminder.findMany({
                where: { remindAt: { lte: new Date() } },
                orderBy: { remindAt: "asc" },
                take: 50,
                select: { id: true, guildId: true, channelId: true, userId: true, message: true, remindAt: true },
            });
        }
        catch (e) {
            logger.error("utility", "failed to query reminders", e);
            return;
        }
        for (const r of due) {
            try {
                const guild = this.client.guilds.cache.get(r.guildId) ?? await this.client.guilds.fetch(r.guildId).catch((e) => { logger.error("utility", "guild fetch failed", { id: r.id, error: e }); return null; });
                if (!guild) {
                    const stillThere = await this.client.guilds.fetch(r.guildId).catch(() => null);
                    if(stillThere) continue;
                    await this.prisma.reminder.delete({ where: { id: r.id } }).catch(() => { });
                    continue;
                }
                const channel = guild.channels.cache.get(r.channelId) ?? await guild.channels.fetch(r.channelId).catch((e) => { logger.error("utility", "channel fetch failed", { id: r.id, error: e }); return null; });
                if (!channel || !("send" in channel)) {
                    if(channel) continue;
                    const retry = await guild.channels.fetch(r.channelId).catch(() => null);
                    if(retry) continue;
                    await this.prisma.reminder.delete({ where: { id: r.id } }).catch(() => { });
                    continue;
                }
                await channel.send({
                    embeds: [
                        embeds.info("Reminder", r.message, [
                            { name: "Set by", value: `<@${r.userId}>`, inline: true },
                        ]),
                    ],
                });
                await this.prisma.reminder.delete({ where: { id: r.id } });
            }
            catch (e) {
                logger.error("utility", "reminder send failed", { id: r.id, error: e });
            }
        }
    }
    buildPollEmbed(question, options) {
        const fields = options.map((o, i) => ({
            name: `${i + 1}. ${o.label}`.slice(0, 256),
            value: `${o.votes} vote${o.votes === 1 ? "" : "s"}`,
            inline: true,
        }));
        return embeds.neutral("Poll", question, fields);
    }
    async handlePollVote(interaction) {
        const parts = interaction.customId.split(":");
        const messageId = parts[1];
        const indexStr = parts[2];
        if (!messageId || indexStr === undefined) {
            await interaction.reply({ embeds: [embeds.error("Invalid vote", "This poll is no longer valid.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const index = Number(indexStr);
        const userId = interaction.user.id;
        const poll = await this.prisma.poll.findUnique({ where: { messageId } }).catch(() => null);
        if (!poll) {
            this.pollVoters.delete(messageId);
            await interaction.reply({ embeds: [embeds.error("Poll ended", "This poll no longer exists.")], flags: MessageFlags.Ephemeral });
            return;
        }
        if(poll.endsAt && new Date(poll.endsAt) <= new Date()){
            this.pollVoters.delete(messageId);
            await interaction.reply({ embeds: [embeds.error("Poll ended", "This poll no longer exists.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const initialOptions = typeof poll.options === "string" ? JSON.parse(poll.options) : (poll.options ?? []);
        if (!Number.isInteger(index) || index < 0 || index >= initialOptions.length) {
            await interaction.reply({ embeds: [embeds.error("Invalid option", "That option does not exist.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const voters = this._trackPollVoter(messageId, userId);
        if (voters.has(userId)) {
            await interaction.reply({ embeds: [embeds.warn("Already voted", "You have already voted in this poll.")], flags: MessageFlags.Ephemeral });
            return;
        }
        voters.add(userId);
        const updated = await this.prisma.$transaction(async (tx) => {
            const fresh = await tx.poll.findUnique({ where: { messageId } });
            if (!fresh) return null;
            const freshOpts = typeof fresh.options === "string" ? JSON.parse(fresh.options) : (fresh.options ?? []);
            if (index >= freshOpts.length) return null;
            freshOpts[index] = { ...freshOpts[index], votes: (freshOpts[index].votes ?? 0) + 1 };
            return tx.poll.update({ where: { messageId }, data: { options: JSON.stringify(freshOpts) } });
        }).catch(() => null);
        if(!updated){ this.pollVoters.delete(messageId); await interaction.reply({ embeds: [embeds.error("Vote failed", "Could not record vote. Try again.")], flags: MessageFlags.Ephemeral }); return; }
        const options = typeof updated.options === "string" ? JSON.parse(updated.options) : (updated.options ?? []);
        const message = interaction.message;
        if (message?.editable) {
            await message.edit({ embeds: [this.buildPollEmbed(poll.question, options)] }).catch(() => { });
        }
        await interaction.reply({ embeds: [embeds.success("Vote recorded", `You voted for **${options[index].label}**.`)], flags: MessageFlags.Ephemeral });
    }
    buildPollButtons(messageId, options) {
        const wrap = (start, end) => {
            const row = new ActionRowBuilder();
            options.slice(start, end).forEach((o, i) => {
                const idx = start + i;
                row.addComponents(new ButtonBuilder()
                    .setCustomId(`poll:vote:${messageId}:${idx}`)
                    .setLabel(`${idx + 1}. ${o.label}`.slice(0, 80))
                    .setStyle(ButtonStyle.Secondary));
            });
            return row;
        };
        const rows = [wrap(0, 5)];
        if (options.length > 5)
            rows.push(wrap(5, 10));
        return rows;
    }
    makeAvatarButton(url) {
        return new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Open avatar").setURL(url).setStyle(ButtonStyle.Link));
    }
    async createPoll(data) {
        await this.prisma.poll.create({ data: { ...data, options: JSON.stringify(data.options) } });
    }
    async createReminder(data) {
        await this.prisma.reminder.create({ data });
    }
}
//# sourceMappingURL=utility.js.map
