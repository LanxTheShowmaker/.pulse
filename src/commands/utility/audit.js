import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("audit").setDescription("Audit timeline")
        .addSubcommand(s=> s.setName("timeline").setDescription("View timeline").addStringOption(o=>o.setName("category").setDescription("Category").addChoices({name:"All",value:"all"},{name:"Moderation",value:"moderation"},{name:"Tickets",value:"tickets"},{name:"AutoMod",value:"automod"},{name:"Economy",value:"economy"},{name:"Leveling",value:"leveling"},{name:"Config",value:"config"})).addIntegerOption(o=>o.setName("limit").setDescription("Limit 1-50").setMinValue(1).setMaxValue(50)))
        .addSubcommand(s=> s.setName("user").setDescription("User history").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)))
        .addSubcommand(s=> s.setName("stats").setDescription("Audit stats")),
    category:"Utility",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
        const svc=interaction.client.services.audit;
        if(sub==="timeline"){
            let cat=interaction.options.getString("category")||null;
            if(cat==="all") cat=null;
            const limit=interaction.options.getInteger("limit")||15;
            const rows=await svc.timeline(interaction.guildId,{ category:cat||undefined, limit });
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setTitle(`Audit Timeline ${cat? "• "+cat:""}`).setTimestamp();
            if(!rows.length) embed.setDescription("No audit entries found for this filter.");
            else embed.setDescription(rows.map(r=> { let reason=""; try{ reason=JSON.parse(r.details||"{}").reason||""; }catch{} return `<t:${Math.floor(new Date(r.createdAt).getTime()/1000)}:R> **${r.category}** \`${r.action}\` <@${r.actorId||"?" }> → <@${r.targetId||"?" }> ${reason}`; }).map(s=>s.slice(0,200)).join("\n").slice(0,4000));
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="user"){
            const user=interaction.options.getUser("user");
            const rows=await svc.timeline(interaction.guildId,{ targetId:user.id, limit:20 });
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setAuthor({ name:`${user.tag} — Audit`, iconURL:user.displayAvatarURL()}).setDescription(rows.length? rows.map(r=> `<t:${Math.floor(new Date(r.createdAt).getTime()/1000)}:R> ${r.category}/${r.action}`).join("\n").slice(0,3000) : "No history found for this user.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="stats"){
            const s=await svc.stats(interaction.guildId);
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setTitle("Audit Stats").setDescription(`**${s.total}** total\n` + s.byCategory.map(c=> `${c.category}: ${c._count._all}`).join("\n"));
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
    }
};
