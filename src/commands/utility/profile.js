import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("profile").setDescription("User profile card — leveling, economy, achievements").addUserOption(o=>o.setName("user").setDescription("User")),
    category:"Utility",
    async execute(interaction){
        const user=interaction.options.getUser("user") ?? interaction.user;
        const guildId=interaction.guildId;
        const [rank, bal, streak, ach] = await Promise.all([
            interaction.client.services.leveling.getCard(guildId, user.id).catch(()=>null),
            interaction.client.services.economy.get(guildId, user.id).catch(()=>0),
            interaction.client.services.leveling.getStreak(guildId, user.id).catch(()=>null),
            interaction.client.services.achievements.getUserProgress(guildId, user.id).catch(()=>[])
        ]);
        const unlocked=ach.filter(a=> a.progress?.unlocked).length;
        const embed=new EmbedBuilder().setColor(Theme.panel).setAuthor({ name:`${user.tag} — Profile`, iconURL:user.displayAvatarURL()}).setThumbnail(user.displayAvatarURL({ size:256})).setTimestamp();
        const fields=[];
        if(rank) fields.push({ name:"Level", value:`**Lv ${rank.level}** ${rank.progress.bar} ${rank.progress.pct}%\nRank #${rank.rank}/${rank.total} • ${rank.xp}/${rank.progress.need} XP`, inline:false });
        else fields.push({ name:"Level", value:"No XP yet. Send messages to earn XP.", inline:false });
        fields.push({ name:"Economy", value:`**${bal}** coins`, inline:true });
        fields.push({ name:"Streak", value: streak? `**${streak.streak}** days (best ${streak.longest})`:"—", inline:true });
        fields.push({ name:"Achievements", value:`**${unlocked}/${ach.length}** unlocked`, inline:true });
        if(unlocked>0) fields.push({ name:"Recent Unlocks", value: ach.filter(a=>a.progress?.unlocked).slice(0,3).map(a=> `${a.achievement.icon||"🏆"} ${a.achievement.name}`).join("\n").slice(0,1000) || "—"});
        embed.addFields(fields);
        return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
    }
};
