import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
const answers = ["It is certain.","It is decidedly so.","Without a doubt.","Yes definitely.","You may rely on it.","As I see it, yes.","Most likely.","Outlook good.","Yes.","Signs point to yes.","Reply hazy, try again.","Ask again later.","Better not tell you now.","Cannot predict now.","Concentrate and ask again.","Don't count on it.","My reply is no.","My sources say no.","Outlook not so good.","Very doubtful."];
export default {
    data: new SlashCommandBuilder().setName("8ball").setDescription("Ask the magic 8ball").addStringOption(o=>o.setName("question").setDescription("Your question").setRequired(true)),
    category: "Fun",
    async execute(interaction){
        const q = interaction.options.getString("question");
        const a = answers[Math.floor(Math.random()*answers.length)];
        const embed = embeds.panel("8-Ball", `> **Q:** ${q}\n\n> **A:** *${a}*`, []);
        await interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
};
