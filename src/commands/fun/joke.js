import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

const JOKES = [
    "Why don't scientists trust atoms? Because they make up everything.",
    "Why did the scarecrow win an award? He was outstanding in his field.",
    "What do you call a fake noodle? An impasta.",
    "Why don't eggs tell jokes? They'd crack each other up.",
    "I'm reading a book about anti-gravity. It's impossible to put down.",
    "What do you call a bear with no teeth? A gummy bear.",
    "Why did the math book look so sad? Because it had too many problems.",
    "What do you call a dog that does magic tricks? A Labracadabrador.",
    "Why can't you give Elsa a balloon? Because she will let it go.",
    "What did the ocean say to the beach? Nothing, it just waved.",
];

export default {
    category: "fun",
    data: new SlashCommandBuilder().setName("joke").setDescription("Hear a random joke"),
    async execute(interaction) {
        const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
        const embed = panel("Joke", joke);
        await interaction.reply({ embeds: [embed] });
    },
};
