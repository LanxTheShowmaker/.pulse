import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

const NUMBERS = ["1\u20E3", "2\u20E3", "3\u20E3", "4\u20E3", "5\u20E3", "6\u20E3", "7\u20E3", "8\u20E3", "9\u20E3", "\uD83D\uDD1F"];

export default {
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create a poll")
        .addStringOption(o => o.setName("question").setDescription("Poll question").setRequired(true))
        .addStringOption(o => o.setName("options").setDescription("Options separated by | (max 10)").setRequired(true)),

    async execute(interaction) {
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
            .setFooter({ text: `Poll \u2022 ${raw.length} options` })
            .setTimestamp();

        const sent = await interaction.reply({ embeds: [embed], fetchReply: true });
        for (let i = 0; i < raw.length; i++) {
            await sent.react(NUMBERS[i]).catch(() => {});
        }
    },
};
