import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("timestamp")
        .setDescription("Generate Discord timestamp codes")
        .addStringOption(o => o.setName("time").setDescription("Time (e.g. 2024-01-15 14:30, or 'now')").setRequired(false)),
    async execute(interaction) {
        const input = interaction.options.getString("time");
        let date;
        if (!input || input.toLowerCase() === "now") {
            date = new Date();
        } else {
            date = new Date(input);
            if (isNaN(date.getTime())) return interaction.reply({ content: "Invalid date format.", flags: MessageFlags.Ephemeral });
        }

        const ts = Math.floor(date.getTime() / 1000);
        const formats = [
            { label: "Short Time", code: `<t:${ts}:t>`, example: `<t:${ts}:t>` },
            { label: "Long Time", code: `<t:${ts}:T>`, example: `<t:${ts}:T>` },
            { label: "Short Date", code: `<t:${ts}:d>`, example: `<t:${ts}:d>` },
            { label: "Long Date", code: `<t:${ts}:D>`, example: `<t:${ts}:D>` },
            { label: "Long Date/Time", code: `<t:${ts}:f>`, example: `<t:${ts}:f>` },
            { label: "Relative", code: `<t:${ts}:R>`, example: `<t:${ts}:R>` },
        ];

        const codeBlock = formats.map(f => `${f.label.padEnd(16)} ${f.code}`).join("\n");
        const examples = formats.map(f => `${f.label.padEnd(16)} ${f.example}`).join("\n");

        const embed = panel("Timestamps", `\`\`\`\n${codeBlock}\n\`\`\`\n**Preview:**\n${examples}`);
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
