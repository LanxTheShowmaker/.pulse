import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { Theme } from "../../design/theme.js";
export default {
    data: new SlashCommandBuilder().setName("daily").setDescription("Claim daily 100 coins"),
    category:"Economy",
    async execute(interaction){
        const svc = interaction.client.services.economy;
        const res = await svc.claimDaily(interaction.guildId, interaction.user.id);
        if(!res.success) return interaction.reply({ content:`Already claimed — <t:${Math.floor(res.next/1000)}:R>`, flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder().setColor(Theme.success).setDescription(`Claimed **${res.amount}** coins — balance **${res.balance}**`);
        await interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral });
    }
};
