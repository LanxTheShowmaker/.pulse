import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { success, error } from "../../ui/embeds.js";

const OWNER_ID = process.env.OWNER_ID;

export default {
    category: "owner",
    data: new SlashCommandBuilder()
        .setName("eval")
        .setDescription("Evaluate JavaScript code (owner only)")
        .addStringOption(o => o.setName("code").setDescription("Code to evaluate").setRequired(true))
        .addBooleanOption(o => o.setName("silent").setDescription("Don't show output").setRequired(false)),
    async execute(interaction) {
        if (OWNER_ID && interaction.user.id !== OWNER_ID) {
            return interaction.reply({ embeds: [error("Denied", "Bot owner only.")], flags: MessageFlags.Ephemeral });
        }

        const code = interaction.options.getString("code");
        const silent = interaction.options.getBoolean("silent") ?? false;

        try {
            const result = await eval(code);
            const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);

            if (silent) {
                await interaction.reply({ embeds: [success("Eval", `\`\`\`${output.slice(0, 1900)}\`\`\``)], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [success("Eval", `\`\`\`${output.slice(0, 1900)}\`\`\``)] });
            }
        } catch (e) {
            const output = e.stack ?? e.message;
            await interaction.reply({ embeds: [error("Error", `\`\`\`${output.slice(0, 1900)}\`\`\``)], flags: MessageFlags.Ephemeral });
        }
    },
};
