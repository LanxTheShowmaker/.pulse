import { SlashCommandBuilder } from "@discordjs/builders";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
    category:"Fun",
    async execute(interaction){
        const flip = Math.random()<0.5 ? "Heads" : "Tails";
        const embed = embeds.info(`Coinflip`, `**${flip}!**`);
        await interaction.reply({ embeds:[embed] }).catch(()=>{});
    }
};
