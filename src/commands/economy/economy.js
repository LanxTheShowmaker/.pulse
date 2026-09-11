import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("economy").setDescription("Manage coins, jobs, gifts, and history.")
        .addSubcommand(s=> s.setName("weekly").setDescription("Claim weekly"))
        .addSubcommand(s=> s.setName("work").setDescription("Work a job").addStringOption(o=>o.setName("job").setDescription("Job").setRequired(true).addChoices({name:"Miner",value:"miner"},{name:"Guardian",value:"guard"},{name:"Scribe",value:"scribe"},{name:"Healer",value:"healer"})))
        .addSubcommand(s=> s.setName("gift").setDescription("Gift coins").addUserOption(o=>o.setName("user").setDescription("Recipient").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)))
        .addSubcommand(s=> s.setName("history").setDescription("Transaction history").addUserOption(o=>o.setName("user").setDescription("User")))
        .addSubcommand(s=> s.setName("leaderboard").setDescription("Economy leaderboard"))
        .addSubcommand(s=> s.setName("admin").setDescription("Admin controls (staff)").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount (+/-)").setRequired(true)).addStringOption(o=>o.setName("action").setDescription("Action").setRequired(true).addChoices({name:"Add",value:"add"},{name:"Remove",value:"remove"},{name:"Set",value:"set"}))),
    category:"Economy",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const svc=interaction.client.services.economy;
        if(sub==="weekly"){
            const res=await svc.claimWeekly(interaction.guildId, interaction.user.id);
            if(!res.success) return interaction.reply({ content:`Weekly on cooldown — <t:${Math.floor(res.next/1000)}:R>`, flags: MessageFlags.Ephemeral});
            const embed=new EmbedBuilder().setColor(Theme.gold).setDescription(`Claimed **${res.amount}** weekly — balance **${res.balance}**`);
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="work"){
            const job=interaction.options.getString("job");
            const res=await svc.work(interaction.guildId, interaction.user.id, job);
            if(!res.success) return interaction.reply({ embeds:[embeds.error("Work failed", res.reason)], flags: MessageFlags.Ephemeral});
            const embed=new EmbedBuilder().setColor(Theme.success).setDescription(`Worked as **${res.job.name}** — earned **${res.payout}** coins • balance **${res.balance}**`);
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="gift"){
            const user=interaction.options.getUser("user");
            const amt=interaction.options.getInteger("amount");
            if(user.id===interaction.user.id) return interaction.reply({ embeds:[embeds.error("No","Cannot gift self")], flags: MessageFlags.Ephemeral});
            const res=await svc.gift(interaction.guildId, interaction.user.id, user.id, amt);
            if(!res.success) return interaction.reply({ embeds:[embeds.error("Gift failed", res.reason)], flags: MessageFlags.Ephemeral});
            return interaction.reply({ embeds:[embeds.success("Gifted", `Gave **${amt}** to <@${user.id}>`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="history"){
            const user=interaction.options.getUser("user") ?? interaction.user;
            if(user.id !== interaction.user.id){
                const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
                if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
            }
            const hist=await svc.getHistory(interaction.guildId, user.id, 8);
            const embed=new EmbedBuilder().setColor(Theme.panel).setAuthor({ name:`${user.tag} — History`, iconURL:user.displayAvatarURL()}).setDescription(hist.length? hist.map(h=> `\`${h.type}\` **${h.amount>=0?"+":""}${h.amount}** → ${h.balanceAfter} <t:${Math.floor(new Date(h.createdAt).getTime()/1000)}:R>`).join("\n") : "No transaction history yet.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="leaderboard"){
            const board=await svc.getLeaderboard(interaction.guildId,10);
            const embed=new EmbedBuilder().setColor(Theme.gold).setTitle("Economy Leaderboard").setDescription(board.rows.map((r,i)=> `${i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`} <@${r.userId}> **${r.balance}**`).join("\n") || "No leaderboard entries yet.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="admin"){
            const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
            if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
            const user=interaction.options.getUser("user");
            const amt=interaction.options.getInteger("amount");
            const act=interaction.options.getString("action");
            let res;
            if(act==="add") res=await svc.adminAdd(interaction.guildId, user.id, amt, interaction.user.id);
            else if(act==="remove") res=await svc.adminRemove(interaction.guildId, user.id, amt, interaction.user.id);
            else if(act==="set") res=await svc.set(interaction.guildId, user.id, amt, interaction.user.id);
            if(res===undefined) return interaction.reply({ embeds:[embeds.error("Failed","Unexpected admin action")], flags: MessageFlags.Ephemeral});
            return interaction.reply({ embeds:[embeds.success("Admin",`${act} ${amt} for <@${user.id}> → **${res}**`)], flags: MessageFlags.Ephemeral});
        }
    }
};
