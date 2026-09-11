import { SlashCommandBuilder } from "@discordjs/builders";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("meme").setDescription("Random meme"),
    category:"Fun",
    async execute(interaction){
        await interaction.deferReply().catch(()=>{});
        try{
            const res = await fetch("https://meme-api.com/gimme");
            const data = await res.json();
            const embed = embeds.panel(`${data.title ?? "Meme"}`, `> *r/${data.subreddit}* • by *${data.author}*`, []);
            if(data.url) embed.setImage(data.url);
            embed.setURL(data.postLink ?? null);
            await interaction.editReply({ embeds:[embed] }).catch(()=>{});
        }catch{
            await interaction.editReply({ embeds:[embeds.error("Meme failed","Could not fetch meme")] }).catch(()=>{});
        }
    }
};
