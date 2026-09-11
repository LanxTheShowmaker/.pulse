import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("afk").setDescription("Set AFK").addStringOption(o=>o.setName("reason").setDescription("Reason")),
    category:"Utility",
    async execute(interaction){
        const reason=interaction.options.getString("reason") ?? "AFK";
        await interaction.client.services.afk.set(interaction.guildId, interaction.user.id, reason);
        await interaction.reply({ embeds:[embeds.success("AFK",`You are now AFK: ${reason}`)], flags: MessageFlags.Ephemeral });
    }
};
