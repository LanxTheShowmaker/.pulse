import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("hug").setDescription("Hug someone").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),
    category:"Fun",
    async execute(interaction){
        const u=interaction.options.getUser("user");
        const embed = embeds.panel(`Hug`, `> **${interaction.user.username}** hugs **${u.username}**`, []);
        embed.setThumbnail(u.displayAvatarURL({ size:128 }));
        await interaction.reply({ embeds:[embed] }).catch(()=>{});
    }
};
