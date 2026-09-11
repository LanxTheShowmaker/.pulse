import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("analytics").setDescription("Server analytics")
        .addSubcommand(s=> s.setName("overview").setDescription("Overview dashboard"))
        .addSubcommand(s=> s.setName("growth").setDescription("Member growth (14d)"))
        .addSubcommand(s=> s.setName("moderation").setDescription("Moderation stats"))
        .addSubcommand(s=> s.setName("tickets").setDescription("Ticket stats"))
        .addSubcommand(s=> s.setName("economy").setDescription("Economy activity"))
        .addSubcommand(s=> s.setName("leveling").setDescription("Leveling activity")),
    category:"Utility",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const guildId=interaction.guildId;
        const cfg=await interaction.client.services.settings.get(guildId).catch(()=>null);
        const { isStaff } = await import("../../core/services.js");
        if(!isStaff(interaction.member, cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        const svc=interaction.client.services.analytics;
        if(sub==="overview"){
            const snap=await svc.getSnapshot(guildId);
            const growth=await svc.getMemberGrowth(guildId,7);
            const embed=new EmbedBuilder().setColor(Theme.panel).setAuthor({ name:`${interaction.guild.name} • Analytics`, iconURL:interaction.guild.iconURL()??undefined}).setTimestamp()
                .setDescription(`Last 7 days.`)
                .addFields(
                    { name:"Members", value:`**${snap.memberCount}** total\n**${snap.active}** active (7d)\nJoins ${snap.joins} / Leaves ${snap.leaves}`, inline:true },
                    { name:"Engagement", value:`XP users: **${snap.xpCount}**\nMessages tracked: **${snap.messages}**\nTickets: **${snap.ticketCount}**`, inline:true },
                    { name:"Moderation", value:`Cases: **${snap.caseCount}**\nEconomy users: **${snap.economyCount}**`, inline:true },
                    { name:"7d Net", value: growth.map(g=> `${g.date.slice(5)} ${g.net>=0?"+":""}${g.net}`).join(" • ").slice(0,1024) || "—" }
                );
            return interaction.editReply({ embeds:[embed]});
        }
        if(sub==="growth"){
            const data=await svc.getMemberGrowth(guildId,14);
            const lines=data.map(d=> `${d.date}  +${d.joins} / -${d.leaves} = ${d.net>=0?"+":""}${d.net}`).join("\n");
            // ASCII chart
            const max=Math.max(...data.map(d=>Math.max(d.joins, d.leaves)),1);
            const chart=data.map(d=> {
                const jBar="█".repeat(Math.round(d.joins/max*8));
                const lBar="░".repeat(Math.round(d.leaves/max*8));
                return `${d.date.slice(5)} ${jBar} ${d.joins} / ${lBar} ${d.leaves}`;
            }).join("\n");
            const embed=new EmbedBuilder().setColor(Theme.info).setTitle("Member Growth — 14 days").setDescription("```\n"+lines.slice(0,3800)+"\n```").addFields({ name:"Visual", value:"```\n"+chart.slice(0,900)+"\n```"});
            return interaction.editReply({ embeds:[embed]});
        }
        if(sub==="moderation"){
            const s=await svc.getModerationStats(guildId);
            const embed=new EmbedBuilder().setColor(Theme.accent).setTitle("Moderation Analytics").addFields(
                { name:"By Action", value: s.byAction.map(a=> `${a.action}: ${a._count._all}`).join("\n") || "—", inline:true },
                { name:"Recent", value: s.recent.map(c=>`#${c.caseNumber} ${c.action} <@${c.targetId}>`).join("\n").slice(0,1024) || "—" }
            );
            return interaction.editReply({ embeds:[embed]});
        }
        if(sub==="tickets"){
            const total=await interaction.client.prisma.ticket.count({ where:{ guildId }}).catch(()=>0);
            const byStatus=await interaction.client.prisma.ticket.groupBy({ by:["status"], where:{ guildId }, _count:{ _all:true }}).catch(()=>[]);
            const ratings=await interaction.client.prisma.ticketRating.groupBy({ by:["rating"], where:{ guildId }, _count:{_all:true }}).catch(()=>[]);
            const embed=new EmbedBuilder().setColor(Theme.ticket).setTitle("Ticket Analytics").addFields(
                { name:"Total", value:`**${total}**`, inline:true },
                { name:"By Status", value: byStatus.map(o=>`${o.status}: ${o._count._all}`).join("\n") || "—", inline:true },
                { name:"Ratings", value: ratings.map(r=> `${"⭐".repeat(r.rating)}: ${r._count._all}`).join("\n") || "No ratings" }
            );
            return interaction.editReply({ embeds:[embed]});
        }
        if(sub==="economy"){
            const tx=await interaction.client.prisma.economyTransaction.groupBy({ by:["type"], where:{ guildId }, _count:{_all:true }, _sum:{ amount:true }}).catch(()=>[]);
            const top=await interaction.client.services.economy.getLeaderboard(guildId,5).catch(()=>({rows:[]}));
            const embed=new EmbedBuilder().setColor(Theme.gold).setTitle("Economy Analytics").addFields(
                { name:"Transactions", value: tx.map(t=> `${t.type}: ${t._count._all} (Σ ${t._sum.amount})`).join("\n").slice(0,1024) || "—" },
                { name:"Top Wealth", value: top.rows.map((r,i)=> `${i+1}. <@${r.userId}> ${r.balance}`).join("\n") || "—" }
            );
            return interaction.editReply({ embeds:[embed]});
        }
        if(sub==="leveling"){
            const ld=await interaction.client.services.leveling.getLeaderboard(guildId,5);
            const weekly=await interaction.client.services.leveling.getWeeklyLeaderboard(guildId,5).catch(()=>({rows:[]}));
            const embed=new EmbedBuilder().setColor(Theme.gold).setTitle("Leveling Analytics").addFields(
                { name:"All-time Top", value: ld.rows.map((r,i)=> `${i+1}. <@${r.userId}> Lv${r.level}`).join("\n") || "—", inline:true },
                { name:"Weekly Active", value: weekly.rows.map((r,i)=> `${i+1}. <@${r.userId}> Lv${r.level}`).join("\n") || "—", inline:true }
            );
            return interaction.editReply({ embeds:[embed]});
        }
    }
};
