import { SlashCommandBuilder } from "@discordjs/builders";
import { embeds } from "../../design/embeds.js";
const jokes=[
    "There are only 10 kinds of people: those who understand binary and those who don't.",
    "I told my computer a joke — it had a byte.",
    "Why did the server go to therapy? Too many breakdowns.",
    "Parallel lines have so much in common — they’ll never meet.",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "I would tell you a UDP joke, but you might not get it.",
];
export default {
    data: new SlashCommandBuilder().setName("joke").setDescription("Random joke"),
    category:"Fun",
    async execute(interaction){
        const j = jokes[Math.floor(Math.random()*jokes.length)];
        const embed = embeds.panel("Joke", `> *${j}*`, []);
        await interaction.reply({ embeds:[embed] }).catch(()=>{});
    }
};
