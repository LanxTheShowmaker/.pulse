import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("roll")
        .setDescription("Roll a dice")
        .addStringOption(o => o.setName("dice").setDescription("Dice format (e.g. 2d6, d20)").setRequired(false)),
    async execute(interaction) {
        const input = interaction.options.getString("dice") ?? "d6";
        const match = input.match(/^(\d*)d(\d+)$/i);
        if (!match) return interaction.reply({ content: "Invalid format. Use `2d6` or `d20`.", flags: MessageFlags.Ephemeral });

        const count = parseInt(match[1]) || 1;
        const sides = parseInt(match[2]);
        if (count > 25 || sides > 1000) return interaction.reply({ content: "Max 25 dice, max 1000 sides.", flags: MessageFlags.Ephemeral });

        const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
        const total = rolls.reduce((a, b) => a + b, 0);
        const diceDisplay = rolls.map(d => `\`${d}\``).join(" + ");
        const description = count > 1 
            ? `🎲 **${total}**\n${diceDisplay}`
            : `🎲 **${total}**`;
        const embed = panel("Dice Roll", description);
        await interaction.reply({ embeds: [embed] });
    },
};
