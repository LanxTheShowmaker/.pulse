import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("appeal").setDescription("Appeal a moderation case")
        .addSubcommand(s=> s.setName("create").setDescription("Appeal your case").addIntegerOption(o=>o.setName("case").setDescription("Case #").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Why should it be reviewed?").setRequired(true)))
        .addSubcommand(s=> s.setName("list").setDescription("List appeals (staff)").addStringOption(o=>o.setName("status").setDescription("Filter").addChoices({name:"Pending",value:"PENDING"},{name:"All",value:"all"})))
        .addSubcommand(s=> s.setName("review").setDescription("Review appeal (staff)").addStringOption(o=>o.setName("id").setDescription("Appeal ID").setRequired(true)).addStringOption(o=>o.setName("decision").setDescription("Decision").setRequired(true).addChoices({name:"Approve",value:"APPROVED"},{name:"Deny",value:"DENIED"}))),
    category:"Moderation",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const svc=interaction.client.services.cases;
        if(sub==="create"){
            const cnum=interaction.options.getInteger("case");
            const reason=interaction.options.getString("reason");
            const c=await svc.get(interaction.guildId, cnum);
            if(!c) return interaction.reply({ embeds:[embeds.error("Not found","")] , flags: MessageFlags.Ephemeral});
            if(c.targetId!==interaction.user.id && !isStaff(interaction.member, await interaction.client.services.settings.get(interaction.guildId).catch(()=>null))) return interaction.reply({ embeds:[embeds.error("Denied","Only your case")], flags: MessageFlags.Ephemeral});
            const appeal=await svc.createAppeal(interaction.guildId, cnum, interaction.user.id, reason);
            return interaction.reply({ embeds:[embeds.success("Appealed",`Case #${cnum} → appeal \`${appeal.id.slice(0,8)}\` pending review`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="list"){
            if(!isStaff(interaction.member, await interaction.client.services.settings.get(interaction.guildId).catch(()=>null))) return interaction.reply({ embeds:[embeds.error("Staff only","")], flags: MessageFlags.Ephemeral});
            const status=interaction.options.getString("status");
            const list=await svc.listAppeals(interaction.guildId, status==="all"?null:status||"PENDING");
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setTitle("Appeals").setDescription(list.length? list.map(a=> `\`${a.id.slice(0,8)}\` Case #${a.caseNumber} by <@${a.appellantId}> ${a.status} — ${a.reason.slice(0,60)}`).join("\n") : "No appeals found.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="review"){
            if(!isStaff(interaction.member, await interaction.client.services.settings.get(interaction.guildId).catch(()=>null))) return interaction.reply({ embeds:[embeds.error("Staff only","")], flags: MessageFlags.Ephemeral});
            const id=interaction.options.getString("id");
            const decision=interaction.options.getString("decision");
            const appeal=await svc.reviewAppeal(interaction.guildId, id, interaction.user, decision);
            if(!appeal) return interaction.reply({ embeds:[embeds.error("Not found","")] , flags: MessageFlags.Ephemeral});
            if(decision==="APPROVED"){
                // Auto-resolve case
                await svc.resolve(interaction.guildId, appeal.caseNumber, interaction.user).catch(()=>{});
            }
            return interaction.reply({ embeds:[embeds.success("Reviewed",`${decision} \`${id.slice(0,8)}\``)], flags: MessageFlags.Ephemeral});
        }
    }
};
