import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { panel, stat } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

export default {
    category: "owner",
    data: new SlashCommandBuilder()
        .setName("diagnostics")
        .setDescription("Check bot health and diagnostics")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const results = await interaction.client.services.diagnostics.health();

        const statusIcon = (s) => s === "OK" ? "✅" : "❌";
        const lines = results.map(r => `${statusIcon(r.status)} **${r.name}** — ${r.detail}`);

        const embed = panel("Diagnostics", lines.join("\n"));

        const allOk = results.every(r => r.status === "OK");
        embed.setColor(allOk ? Theme.success : Theme.danger);

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
