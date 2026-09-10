import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency."),
    category: "Utility",
    async execute(interaction) {
        const sent = Date.now();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const api = Math.round(interaction.client.ws.ping);
        const latency = Date.now() - sent;
        await interaction.editReply({
            embeds: [embeds.info("Pong", `**API:** \`${api}ms\`  •  **Gateway:** \`${latency}ms\``, [
                { name: "Uptime", value: `> <t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`, inline: true },
                { name: "Guilds", value: `> **${interaction.client.guilds.cache.size}**`, inline: true },
            ])],
        }).catch(() => {});
    },
};
