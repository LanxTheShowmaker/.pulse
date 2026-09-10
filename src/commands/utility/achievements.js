import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("achievements").setDescription("Achievements")
        .addSubcommand(s=> s.setName("view").setDescription("View your or another user achievements").addUserOption(o=>o.setName("user").setDescription("User")))
        .addSubcommand(s=> s.setName("list").setDescription("List all achievements"))
        .addSubcommand(s=> s.setName("leaderboard").setDescription("Achievement leaderboard")),
    category:"Utility",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const svc=interaction.client.services.achievements;
        const guildId=interaction.guildId;
        if(sub==="list"){
            const all=await svc.getForGuild(guildId);
            const byCat={};
            for(const a of all){ (byCat[a.category]=byCat[a.category]||[]).push(a); }
            const embed=new EmbedBuilder().setColor(Theme.panel).setTitle("Achievements").setTimestamp();
            let desc="";
            for(const [cat, arr] of Object.entries(byCat)){
                desc+=`\n**${cat}**\n` + arr.map(a=> `${a.icon||"🏆"} **${a.name}** — ${a.description} *(rewards: ${Object.entries(JSON.parse(a.rewards||"{}")).map(([k,v])=>`${v} ${k}`).join(", ")||"—"})*`).join("\n")+"\n";
            }
            embed.setDescription(desc.slice(0,4000)||"No achievements configured. An admin can add achievements for this server.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="view"){
            const user=interaction.options.getUser("user") ?? interaction.user;
            const prog=await svc.getUserProgress(guildId, user.id);
            const unlocked=prog.filter(p=> p.progress?.unlocked);
            const embed=new EmbedBuilder().setColor(Theme.gold).setAuthor({ name:`${user.tag} — Achievements`, iconURL:user.displayAvatarURL()}).setDescription(`**${unlocked.length}/${prog.length}** unlocked`).setThumbnail(user.displayAvatarURL());
            if(unlocked.length) embed.addFields({ name:"Unlocked", value: unlocked.map(p=> `${p.achievement.icon||"✅"} **${p.achievement.name}** — <t:${Math.floor(new Date(p.progress.unlockedAt).getTime()/1000)}:R>`).join("\n").slice(0,1024) });
            const locked=prog.filter(p=> !p.progress?.unlocked).slice(0,5);
            if(locked.length) embed.addFields({ name:"Locked", value: locked.map(p=> `${p.achievement.icon||"🔒"} ${p.achievement.name} — ${p.achievement.description}`).join("\n").slice(0,1024)});
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="leaderboard"){
            const board=await svc.leaderboard(guildId,10);
            const embed=new EmbedBuilder().setColor(Theme.gold).setTitle("Achievement Leaderboard");
            if(!board.length) embed.setDescription("No achievement unlocks yet. Complete actions to earn achievements.");
            else embed.setDescription(board.map((r,i)=> `${i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`} <@${r.userId}> — **${r.count}**`).join("\n"));
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
    }
};
