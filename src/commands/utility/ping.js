import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";

export default {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
    async execute(interaction) {
        const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply({ content: `Latency: **${latency}ms** • API: **${Math.round(interaction.client.ws.ping)}ms**` });
    },
};
