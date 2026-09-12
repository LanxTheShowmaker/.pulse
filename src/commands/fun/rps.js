import { SlashCommandBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { row, button } from "../../design/components.js";

export default {
    category: "fun",
    data: new SlashCommandBuilder().setName("rps").setDescription("Rock Paper Scissors"),
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
