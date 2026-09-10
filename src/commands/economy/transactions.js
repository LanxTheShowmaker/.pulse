import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { Theme } from "../../design/theme.js";
export default {
    data: new SlashCommandBuilder().setName("transactions").setDescription("Recent economy transactions").addUserOption(o=>o.setName("user").setDescription("User")),
    category:"Economy",
    async execute(interaction){
        const user=interaction.options.getUser("user")||interaction.user;
        const hist=await interaction.client.services.economy.getHistory(interaction.guildId, user.id, 10);
        const embed=new EmbedBuilder().setColor(Theme.gold).setAuthor({ name: user.tag+" — Transactions", iconURL:user.displayAvatarURL()}).setDescription(hist.map(h=> `${h.type} ${h.amount>=0?"+":""}${h.amount} → ${h.balanceAfter} <t:${Math.floor(new Date(h.createdAt).getTime()/1000)}:R>`).join("\n")||"No transactions yet.");
        return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
    }
};