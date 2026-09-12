import { ButtonStyle } from "discord.js";
import { row, button } from "../design/components.js";
import { panel } from "../design/embeds.js";

const CHOICES = ["rock", "paper", "scissors"];
const EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };

function winner(a, b) {
    if (a === b) return "draw";
    if ((a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper")) return "win";
    return "lose";
}

function play(i, playerChoice) {
    const botChoice = CHOICES[Math.floor(Math.random() * 3)];
    const result = winner(playerChoice, botChoice);
    const resultEmoji = result === "draw" ? "🤝" : result === "win" ? "🏆" : "💀";
    const resultText = result === "draw" ? "It's a draw!" : result === "win" ? "You win!" : "You lose!";
    const embed = panel("Rock Paper Scissors", `${EMOJI[playerChoice]} **You** vs **Bot** ${EMOJI[botChoice]}\n\n${resultEmoji} **${resultText}**`);
    i.update({ embeds: [embed], components: [] });

    // Achievement: RPS played
    i.client.services.achievements?.increment(i.guild.id, i.user.id, "rpsPlayed").catch(() => {});
}

export default {
    "rps:rock":     (i) => play(i, "rock"),
    "rps:paper":    (i) => play(i, "paper"),
    "rps:scissors": (i) => play(i, "scissors"),
};
