import { SlashCommandBuilder } from "@discordjs/builders";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("roll").setDescription("Roll dice").addIntegerOption(o=>o.setName("sides").setDescription("Sides").setMinValue(2).setMaxValue(100).setRequired(false)).addIntegerOption(o=>o.setName("count").setDescription("How many").setMinValue(1).setMaxValue(10).setRequired(false)),
    category:"Fun",
    async execute(interaction){
        const sides=interaction.options.getInteger("sides")??6;
        const count=interaction.options.getInteger("count")??1;
        const rolls = Array.from({length:count}, ()=> Math.floor(Math.random()*sides)+1);
        const total = rolls.reduce((a,b)=>a+b,0);
        const embed = embeds.panel(`Roll`, `> **${rolls.join(" + ")}** = **${total}**\n> *${count}d${sides}*`, []);
        await interaction.reply({ embeds:[embed] }).catch(()=>{});
    }
};
