import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
export default {
    data: new SlashCommandBuilder().setName("banner").setDescription("Show user banner").addUserOption(o=>o.setName("user").setDescription("User")),
    category:"Utility",
    async execute(interaction){
        const user=interaction.options.getUser("user")||interaction.user;
        const fetched=await interaction.client.users.fetch(user.id).catch(()=>null);
        const banner = fetched?.bannerURL({ size:512 });
        if(!banner) return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9b8ecf).setDescription("This user has no banner set.")], flags: MessageFlags.Ephemeral});
        return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9b8ecf).setImage(banner).setTitle(user.tag+" — Banner")], flags: MessageFlags.Ephemeral});
    }
};