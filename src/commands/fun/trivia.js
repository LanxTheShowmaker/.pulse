import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { row, button } from "../../design/components.js";

const QUESTIONS = [
    { q: "What planet is known as the Red Planet?", a: "Mars", opts: ["Venus", "Mars", "Jupiter", "Saturn"] },
    { q: "What is the largest ocean on Earth?", a: "Pacific", opts: ["Atlantic", "Indian", "Pacific", "Arctic"] },
    { q: "How many sides does a hexagon have?", a: "6", opts: ["4", "5", "6", "8"] },
    { q: "What gas do plants absorb from the atmosphere?", a: "CO2", opts: ["O2", "CO2", "N2", "H2"] },
    { q: "What is the chemical symbol for gold?", a: "Au", opts: ["Ag", "Au", "Go", "Gd"] },
    { q: "Which continent is Egypt in?", a: "Africa", opts: ["Asia", "Africa", "Europe", "South America"] },
    { q: "What year did World War II end?", a: "1945", opts: ["1943", "1944", "1945", "1946"] },
    { q: "What is the speed of light in km/s (approx)?", a: "300,000", opts: ["150,000", "300,000", "500,000", "1,000,000"] },
    { q: "Who painted the Mona Lisa?", a: "Da Vinci", opts: ["Da Vinci", "Picasso", "Rembrandt", "Monet"] },
    { q: "What is the hardest natural substance?", a: "Diamond", opts: ["Gold", "Iron", "Diamond", "Quartz"] },
];

export default {
    data: new SlashCommandBuilder().setName("trivia").setDescription("Answer a trivia question"),
    async execute(interaction) {
        const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        const shuffled = [...q.opts].sort(() => Math.random() - 0.5);
        const correctIdx = shuffled.indexOf(q.a);

        const buttons = shuffled.map((opt, i) =>
            button(opt, `trivia:${interaction.id}:${i}:${correctIdx}`, ButtonStyle.Secondary)
        );

        await interaction.reply({
            content: `**${q.q}**`,
            components: [row(...buttons)],
            flags: MessageFlags.Ephemeral,
        });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId.startsWith(`trivia:${interaction.id}`),
            time: 15_000,
            max: 1,
        });

        collector.on("collect", async (i) => {
            const idx = parseInt(i.customId.split(":")[3]);
            const correct = parseInt(i.customId.split(":")[4]);
            const isCorrect = idx === correct;
            await i.update({
                content: `${isCorrect ? "Correct!" : `Wrong! The answer was **${q.a}**.`}`,
                components: [],
            });
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) {
                interaction.editReply({ content: `Time's up! The answer was **${q.a}**.`, components: [] }).catch(() => {});
            }
        });
    },
};
