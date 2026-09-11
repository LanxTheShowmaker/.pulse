import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
    async execute(interaction) {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        const emoji = result === "Heads" ? "🪙" : "🪙";
        const embed = panel("Coin Flip", `${emoji} **${result}!**`);
        await interaction.reply({ embeds: [embed] });
    },
};
