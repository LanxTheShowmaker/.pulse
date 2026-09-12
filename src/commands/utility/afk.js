import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { success } from "../../design/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("afk")
        .setDescription("Set your AFK status")
        .addStringOption(o => o.setName("reason").setDescription("AFK reason").setRequired(false)),

    async execute(interaction) {
        const { afk } = interaction.client.services;
        const reason = interaction.options.getString("reason") ?? "AFK";

        await afk.set(interaction.guild.id, interaction.user.id, reason);
        await interaction.reply({
            embeds: [success("AFK Set", `You are now AFK.\n**Reason:** ${reason}`)],
        });
    },
};
