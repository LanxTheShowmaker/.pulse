import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

const MEMES = [
    "When the code works on the first try — *suspicious look*",
    "Me: I'll fix this bug in 5 minutes. Also me: 3 hours later...",
    "Git commit -m 'fixed everything' *breaks everything*",
    "The code is documentation enough — every dev ever",
    "Stack Overflow: Am I a joke to you?",
    "99 little bugs in the code, 99 little bugs... fix one, compile... 127 little bugs in the code",
    "It's not a bug, it's a feature",
    "I don't always test my code, but when I do, I do it in production",
    "There's no place like 127.0.0.1",
    "A SQL query walks into a bar, walks up to two tables and asks: Can I join you?",
];

export default {
    data: new SlashCommandBuilder().setName("meme").setDescription("Get a random dev meme"),
    async execute(interaction) {
        const meme = MEMES[Math.floor(Math.random() * MEMES.length)];
        const embed = panel("Dev Meme", meme);
        await interaction.reply({ embeds: [embed] });
    },
};
