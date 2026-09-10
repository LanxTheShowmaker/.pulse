import { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from "discord.js";
import { logger } from "../core/logger.js";
import { embeds } from "../design/embeds.js";

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
        this.client.components.set("poll:vote", async (interaction) => {
            await this.handlePollVote(interaction).catch((e) => logger.error("utility", "poll vote failed", e));
        });
        process.once("beforeExit", () => clearInterval(this.interval));
    }
    async tickReminders() {
        let due = [];
        try {
            due = await this.prisma.reminder.findMany({
                where: { remindAt: { lte: new Date() } },
                select: { id: true, guildId: true, channelId: true, userId: true, message: true },
            });
        }
        catch (e) {
            logger.error("utility", "failed to query reminders", e);
            return;
        }
        for (const r of due) {
            try {
                const guild = this.client.guilds.cache.get(r.guildId);
                if (!guild) {
                    await this.prisma.reminder.delete({ where: { id: r.id } }).catch(() => { });
                    continue;
                }
                const channel = guild.channels.cache.get(r.channelId);
                if (!channel || !("send" in channel)) {
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
            await interaction.reply({ embeds: [embeds.error("Poll ended", "This poll no longer exists.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const options = typeof poll.options === "string" ? JSON.parse(poll.options) : (poll.options ?? []);
        if (!Number.isInteger(index) || index < 0 || index >= options.length) {
            await interaction.reply({ embeds: [embeds.error("Invalid option", "That option does not exist.")], flags: MessageFlags.Ephemeral });
            return;
        }
        let voters = this.pollVoters.get(messageId);
        if (!voters) {
            voters = new Set();
            this.pollVoters.set(messageId, voters);
        }
        if (voters.has(userId)) {
            await interaction.reply({ embeds: [embeds.warn("Already voted", "You have already voted in this poll.")], flags: MessageFlags.Ephemeral });
            return;
        }
        voters.add(userId);
        options[index] = { ...options[index], votes: options[index].votes + 1 };
        await this.prisma.poll.update({ where: { messageId }, data: { options: JSON.stringify(options) } }).catch(() => { });
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