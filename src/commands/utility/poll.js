import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { panel, stat, success, error } from "../../design/embeds.js";
import { Theme, Brand } from "../../design/theme.js";

const NUMBERS = ["1\u20E3", "2\u20E3", "3\u20E3", "4\u20E3", "5\u20E3", "6\u20E3", "7\u20E3", "8\u20E3", "9\u20E3", "\uD83D\uDD1F"];

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create or manage polls")
        .addSubcommand(sub => sub
            .setName("create")
            .setDescription("Create a new poll")
            .addStringOption(o => o.setName("question").setDescription("Poll question").setRequired(true))
            .addStringOption(o => o.setName("options").setDescription("Options separated by | (max 10)").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("results")
            .setDescription("Show current poll results")
            .addStringOption(o => o.setName("message-id").setDescription("Poll message ID").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("end")
            .setDescription("End a poll and show final results")
            .addStringOption(o => o.setName("message-id").setDescription("Poll message ID").setRequired(true))),

    async execute(interaction) {
        const prisma = interaction.client.services.prisma;
        const sub = interaction.options.getSubcommand();

        if (sub === "create") {
            const question = interaction.options.getString("question");
            const raw = interaction.options.getString("options").split("|").map(s => s.trim()).filter(Boolean);
            if (raw.length < 2) return interaction.reply({ content: "Need at least 2 options.", flags: MessageFlags.Ephemeral });
            if (raw.length > 10) return interaction.reply({ content: "Maximum 10 options.", flags: MessageFlags.Ephemeral });

            const lines = raw.map((o, i) => `**${i + 1}.** ${o}`);
            const { EmbedBuilder } = await import("@discordjs/builders");
            const embed = new EmbedBuilder()
                .setColor(Theme.panel)
                .setTitle(`\uD83D\uDDF3️ ${question}`)
                .setDescription(lines.join("\n\n"))
                .setFooter({ text: `Poll \u2022 ${raw.length} options \u2022 Created by ${interaction.user.tag}` })
                .setTimestamp();

            const sent = await interaction.reply({ embeds: [embed], fetchReply: true });
            for (let i = 0; i < raw.length; i++) {
                await sent.react(NUMBERS[i]).catch(() => {});
            }

            await prisma.poll.create({
                data: {
                    guildId: interaction.guild.id,
                    channelId: interaction.channel.id,
                    messageId: sent.id,
                    authorId: interaction.user.id,
                    question,
                    options: JSON.stringify(raw),
                },
            });
        }

        if (sub === "results") {
            const messageId = interaction.options.getString("message-id");
            const poll = await prisma.poll.findUnique({ where: { messageId } });
            if (!poll) return interaction.reply({ embeds: [error("Not Found", "Poll not found.")], flags: MessageFlags.Ephemeral });

            const options = JSON.parse(poll.options);
            const channel = interaction.guild.channels.cache.get(poll.channelId);
            if (!channel) return interaction.reply({ embeds: [error("Not Found", "Poll channel not found.")], flags: MessageFlags.Ephemeral });

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) return interaction.reply({ embeds: [error("Not Found", "Poll message not found.")], flags: MessageFlags.Ephemeral });

            const results = options.map((opt, i) => {
                const reaction = message.reactions.cache.get(NUMBERS[i]);
                const count = (reaction?.count ?? 1) - 1; // subtract bot's reaction
                return { option: opt, votes: Math.max(0, count) };
            });

            const total = results.reduce((sum, r) => sum + r.votes, 0);
            const maxVotes = Math.max(...results.map(r => r.votes));

            const lines = results.map(r => {
                const bar = total > 0 ? "█".repeat(Math.round((r.votes / total) * 10)) : "";
                const pct = total > 0 ? Math.round((r.votes / total) * 100) : 0;
                const winner = r.votes === maxVotes && r.votes > 0 ? " 👑" : "";
                return `**${r.option}**${winner}\n${bar || "▱"} ${r.votes} vote${r.votes !== 1 ? "s" : ""} (${pct}%)`;
            });

            const embed = panel(`🗳️ ${poll.question}`, lines.join("\n\n"))
                .setFooter({ text: `Total: ${total} vote${total !== 1 ? "s" : ""}` });

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === "end") {
            const messageId = interaction.options.getString("message-id");
            const poll = await prisma.poll.findUnique({ where: { messageId } });
            if (!poll) return interaction.reply({ embeds: [error("Not Found", "Poll not found.")], flags: MessageFlags.Ephemeral });

            if (poll.authorId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [error("Denied", "Only the poll creator or admins can end it.")], flags: MessageFlags.Ephemeral });
            }

            const options = JSON.parse(poll.options);
            const channel = interaction.guild.channels.cache.get(poll.channelId);
            if (!channel) return interaction.reply({ embeds: [error("Not Found", "Poll channel not found.")], flags: MessageFlags.Ephemeral });

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) return interaction.reply({ embeds: [error("Not Found", "Poll message not found.")], flags: MessageFlags.Ephemeral });

            const results = options.map((opt, i) => {
                const reaction = message.reactions.cache.get(NUMBERS[i]);
                const count = (reaction?.count ?? 1) - 1;
                return { option: opt, votes: Math.max(0, count) };
            });

            const total = results.reduce((sum, r) => sum + r.votes, 0);
            const sorted = [...results].sort((a, b) => b.votes - a.votes);
            const winner = sorted[0];

            const lines = results.map(r => {
                const marker = r.votes === winner.votes && r.votes > 0 ? "👑 " : "";
                return `${marker}**${r.option}** — ${r.votes} vote${r.votes !== 1 ? "s" : ""}`;
            });

            const embed = panel(`🗳️ ${poll.question}`, lines.join("\n\n"))
                .setFooter({ text: `Final \u2022 Winner: ${winner.option} \u2022 ${total} total votes` });

            await message.edit({ embeds: [embed] }).catch(() => {});
            await message.reactions.removeAll().catch(() => {});

            await interaction.reply({ embeds: [success("Poll Ended", `Winner: **${winner.option}** with ${winner.votes} vote${winner.votes !== 1 ? "s" : ""}`)], flags: MessageFlags.Ephemeral });
        }
    },
};
