import { SlashCommandBuilder } from "@discordjs/builders";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("ship").setDescription("Ship two users").addUserOption(o=>o.setName("user1").setDescription("First").setRequired(true)).addUserOption(o=>o.setName("user2").setDescription("Second").setRequired(true)),
    category:"Fun",
    async execute(interaction){
        const u1=interaction.options.getUser("user1");
        const u2=interaction.options.getUser("user2");
        const pct=Math.floor(Math.random()*101);
        const bar="█".repeat(Math.floor(pct/10)) + "░".repeat(10-Math.floor(pct/10));
        const love = pct>80?"Great match":pct>60?"Good":pct>40?"Average":pct>20?"Low":"Very low";
        const embed = embeds.panel(`Ship`, `> **${u1.username}** + **${u2.username}**\n\n\`${bar}\` **${pct}%** — *${love}*`, []);
        await interaction.reply({ embeds:[embed] }).catch(()=>{});
    }
};
