import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { row, button } from "../../design/components.js";
import { Theme } from "../../design/theme.js";

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

        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        const lines = raw.map((o, i) => `${emojis[i]} ${o}`);
        const { EmbedBuilder } = await import("@discordjs/builders");
        const embed = new EmbedBuilder()
            .setColor(Theme.accent)
            .setTitle(question)
            .setDescription(lines.join("\n\n"))
            .setFooter({ text: `.pulse • Poll` })
            .setTimestamp();

        const sent = await interaction.reply({ embeds: [embed], fetchReply: true });
        for (let i = 0; i < raw.length; i++) {
            await sent.react(emojis[i]).catch(() => {});
        }
    },
};
