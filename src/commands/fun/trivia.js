import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { embeds } from "../../design/embeds.js";
const qs=[
    {q:"What is 2+2?", a:["3","4","5","22"], c:1},
    {q:"Capital of France?", a:["Berlin","Paris","Rome","Madrid"], c:1},
    {q:"Which is not a programming language?", a:["Python","Anaconda","Java","C++"], c:1},
    {q:"Which command lists available commands?", a:["/help","/roll","/hug","/coinflip"], c:0},
];
export default {
    data: new SlashCommandBuilder().setName("trivia").setDescription("Trivia challenge"),
    category:"Fun",
    async execute(interaction){
        const cur=qs[Math.floor(Math.random()*qs.length)];
        const embed = embeds.panel("Trivia", `> **${cur.q}**`, []);
        const row = new ActionRowBuilder();
        cur.a.forEach((ans,i)=> row.addComponents(new ButtonBuilder().setCustomId(`trivia:${interaction.id}:${i}`).setLabel(ans.slice(0,80)).setStyle(ButtonStyle.Secondary)));
        await interaction.reply({ embeds:[embed], components:[row], flags: MessageFlags.Ephemeral }).catch(()=>{});
        const client=interaction.client;
        cur.a.forEach((_,i)=>{
            client.components.set(`trivia:${interaction.id}:${i}`, async (ii)=>{
                const correct = i===cur.c;
                await ii.update({ embeds:[embeds[correct?"success":"error"](correct?"Correct!":"Wrong!", `Answer: **${cur.a[cur.c]}**`)], components:[] }).catch(()=>{});
            });
        });
        const cleanup = setTimeout(()=>{ cur.a.forEach((_,i)=> client.components.delete(`trivia:${interaction.id}:${i}`)); }, 60_000);
        if (cleanup.unref) cleanup.unref();
    }
};
