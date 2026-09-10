import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getHealthEmbed } from "./health.js";
export default {
    data: new SlashCommandBuilder().setName("status").setDescription("Bot status — quick health check"),
    category:"Utility",
    async execute(interaction){
        const e=await getHealthEmbed(interaction.guildId, interaction.client);
        // Reuse same embed but change title to Status for variety
        e.setTitle(e.data.title.replace("Health","Status"));
        return interaction.reply({ embeds:[e], flags: MessageFlags.Ephemeral});
    }
};
