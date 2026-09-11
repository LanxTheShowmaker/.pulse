import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";

export default {
    data: new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
    async execute(interaction) {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        await interaction.reply({ content: `**${result}!**`, flags: MessageFlags.Ephemeral });
    },
};
