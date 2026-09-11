import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

function latencyBar(ms) {
    const filled = Math.min(Math.round(ms / 50), 20);
    return `\`${"█".repeat(filled)}${"░".repeat(20 - filled)}\``;
}

export default {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
    async execute(interaction) {
        const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
        const ws = sent.createdTimestamp - interaction.createdTimestamp;
        const api = Math.round(interaction.client.ws.ping);

        const embed = panel("Pong!", `WS: **${ws}ms** ${latencyBar(ws)}\nAPI: **${api}ms** ${latencyBar(api)}`);
        await interaction.editReply({ embeds: [embed] });
    },
};
