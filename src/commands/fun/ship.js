import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel, progressBar } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

export default {
    data: new SlashCommandBuilder()
        .setName("ship")
        .setDescription("Check compatibility between two users")
        .addUserOption(o => o.setName("user1").setDescription("First user").setRequired(true))
        .addUserOption(o => o.setName("user2").setDescription("Second user").setRequired(true)),
    async execute(interaction) {
        const user1 = interaction.options.getUser("user1");
        const user2 = interaction.options.getUser("user2");

        // Deterministic score based on user IDs
        const hash = [...user1.id + user2.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const score = hash % 101;

        const bar = progressBar(score, 100, 10);
        const heartEmoji = score >= 50 ? "💕" : "💔";

        let verdict;
        if (score >= 90) verdict = "Perfect match!";
        else if (score >= 70) verdict = "Great compatibility!";
        else if (score >= 50) verdict = "There's potential...";
        else if (score >= 30) verdict = "Maybe just friends?";
        else verdict = "Not a match.";

        const embed = panel("Ship", `${heartEmoji} \`${bar}\` **${score}%**`)
            .addFields(
                { name: "Pair", value: `${user1.tag} + ${user2.tag}`, inline: true },
                { name: "Verdict", value: verdict, inline: true },
            );

        await interaction.reply({ embeds: [embed] });
    },
};
