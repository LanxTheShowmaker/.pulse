import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { row, button } from "../../design/components.js";
import { panel } from "../../design/embeds.js";

const CHOICES = ["rock", "paper", "scissors"];
const EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };

function winner(a, b) {
    if (a === b) return "draw";
    if ((a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper")) return "win";
    return "lose";
}

function play(interaction, playerChoice) {
    const botChoice = CHOICES[Math.floor(Math.random() * 3)];
    const result = winner(playerChoice, botChoice);
    const resultEmoji = result === "draw" ? "🤝" : result === "win" ? "🏆" : "💀";
    const resultText = result === "draw" ? "It's a draw!" : result === "win" ? "You win!" : "You lose!";
    const embed = panel("Rock Paper Scissors", `${EMOJI[playerChoice]} **You** vs **Bot** ${EMOJI[botChoice]}\n\n${resultEmoji} **${resultText}**`);
    interaction.update({ embeds: [embed], components: [] });
}

export default {
    data: new SlashCommandBuilder().setName("rps").setDescription("Rock Paper Scissors"),
    components: {
        "rps:rock": (i) => play(i, "rock"),
        "rps:paper": (i) => play(i, "paper"),
        "rps:scissors": (i) => play(i, "scissors"),
    },
    async execute(interaction) {
        await interaction.reply({
            content: "**Rock Paper Scissors** — choose your weapon:",
            components: [row(
                button("🪨 Rock", "rps:rock", ButtonStyle.Primary),
                button("📄 Paper", "rps:paper", ButtonStyle.Primary),
                button("✂️ Scissors", "rps:scissors", ButtonStyle.Primary),
            )],
        });
    },
};
