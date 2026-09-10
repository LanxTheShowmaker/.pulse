import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds, confirmationRow } from "../../design/embeds.js";
import { isModerator, isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("modcenter").setDescription("Advanced Moderation Center")
        .addSubcommand(s=> s.setName("browse").setDescription("Browse recent cases").addIntegerOption(o=>o.setName("page").setDescription("Page").setMinValue(1)))
        .addSubcommand(s=> s.setName("history").setDescription("Infraction history for user").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)))
        .addSubcommand(s=> s.setName("view").setDescription("View case").addIntegerOption(o=>o.setName("case").setDescription("Case #").setRequired(true)))
        .addSubcommand(s=> s.setName("note").setDescription("Add note to user/case").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("content").setDescription("Note").setRequired(true)).addIntegerOption(o=>o.setName("case").setDescription("Attach to case #")))
        .addSubcommand(s=> s.setName("edit").setDescription("Edit case reason").addIntegerOption(o=>o.setName("case").setDescription("Case #").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("New reason").setRequired(true)))
        .addSubcommand(s=> s.setName("stats").setDescription("Moderator statistics").addUserOption(o=>o.setName("moderator").setDescription("Moderator")))
        .addSubcommand(s=> s.setName("thresholds").setDescription("Configure escalation thresholds").addIntegerOption(o=>o.setName("warn").setDescription("Warn threshold")).addIntegerOption(o=>o.setName("timeout").setDescription("Timeout threshold")).addIntegerOption(o=>o.setName("kick").setDescription("Kick threshold")).addIntegerOption(o=>o.setName("ban").setDescription("Ban threshold")))
        .addSubcommand(s=> s.setName("appeals").setDescription("View appeals").addStringOption(o=>o.setName("status").setDescription("PENDING/APPROVED/DENIED").addChoices({name:"Pending",value:"PENDING"},{name:"Approved",value:"APPROVED"},{name:"Denied",value:"DENIED"})))
        .addSubcommand(s=> s.setName("appeal").setDescription("Appeal a case").addIntegerOption(o=>o.setName("case").setDescription("Case #").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Appeal reason").setRequired(true))),
    category:"Moderation",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const guildId=interaction.guildId;
        const guild=interaction.guild;
        const cases=interaction.client.services.cases;
        const mod=interaction.client.services.moderation;
        // Appeals sub may be used by non-moderators
        if(sub==="appeal"){
            const caseNum=interaction.options.getInteger("case");
            const reason=interaction.options.getString("reason");
            const c=await cases.get(guildId, caseNum);
            if(!c) return interaction.reply({ embeds:[embeds.error("Not found",`Case #${caseNum} not found`)], flags: MessageFlags.Ephemeral});
            if(c.targetId !== interaction.user.id && !isModerator(interaction.member, await interaction.client.services.settings.get(guildId).catch(()=>null))){
                return interaction.reply({ embeds:[embeds.error("Denied","You can only appeal your own cases")], flags: MessageFlags.Ephemeral});
            }
            await cases.createAppeal(guildId, caseNum, interaction.user.id, reason);
            await interaction.client.services.audit?.log(guildId,{ actorId:interaction.user.id, targetId:c.targetId, action:"appeal_create", category:"moderation", details:{ caseNumber:caseNum }}).catch(()=>{});
            return interaction.reply({ embeds:[embeds.success("Appeal submitted",`Case #${caseNum} appeal queued for review`)], flags: MessageFlags.Ephemeral});
        }
        // All other subs require moderator
        const cfg=await interaction.client.services.settings.get(guildId).catch(()=>null);
        if(!isModerator(interaction.member,cfg) && !isStaff(interaction.member,cfg)){
            return interaction.reply({ embeds:[embeds.error("No permission","Moderator required")], flags: MessageFlags.Ephemeral});
        }
        if(sub==="browse"){
            const page=Math.max(1, interaction.options.getInteger("page")||1);
            const per=8;
            const recent=await cases.recent(guildId, per);
            const total=await cases.count(guildId).catch(()=>recent.length);
            const embed=new EmbedBuilder().setColor(Theme.accent).setTitle(`Moderation Center — Recent`).setFooter({ text:`Page ${page} • ${total} cases`}).setTimestamp();
            if(!recent.length) embed.setDescription("No cases yet — new cases will appear here.");
            else embed.setDescription(recent.map(c=> `\`#${c.caseNumber}\` **${c.action}** <@${c.targetId}> by <@${c.moderatorId}> — ${c.reason?.slice(0,60)||"No reason"} ${c.resolved?" (Resolved)":""}`).join("\n"));
            const row=new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`modcenter:browse:${page+1}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(recent.length<per)
            );
            await interaction.reply({ embeds:[embed], components: recent.length? [row] : [], flags: MessageFlags.Ephemeral }).catch(()=>{});
            // handler
            const key=`modcenter:browse:${page+1}`;
            interaction.client.components.set(key, async(i)=>{
                if(!isModerator(i.member, await i.client.services.settings.get(guildId).catch(()=>null))) return i.reply({ embeds:[embeds.error("No perm","")], flags: MessageFlags.Ephemeral});
                const nextPage=parseInt(i.customId.split(":")[2]);
                const more=await i.client.services.cases.recent(guildId, per); // simplified pagination
                await i.update({ embeds:[embed], components:[] }).catch(()=>{});
            });
            return;
        }
        if(sub==="history"){
            const user=interaction.options.getUser("user");
            const hist=await mod.getUserHistory(guildId, user.id);
            const embed=new EmbedBuilder().setColor(Theme.accent).setAuthor({ name:`${user.tag} — History`, iconURL:user.displayAvatarURL()}).setDescription(`**${hist.total}** cases • **${hist.warns}** warns`).setTimestamp();
            if(hist.history.length) embed.addFields({ name:"Recent", value: hist.history.slice(0,10).map(c=>`#${c.caseNumber} ${c.action} ${c.reason?.slice(0,40)||""} <t:${Math.floor(new Date(c.createdAt).getTime()/1000)}:R>`).join("\n").slice(0,1024) });
            if(hist.notes.length) embed.addFields({ name:"Notes", value: hist.notes.slice(0,5).map(n=> `${n.content.slice(0,80)} — <t:${Math.floor(new Date(n.createdAt).getTime()/1000)}:R>`).join("\n").slice(0,1024) });
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="view"){
            const num=interaction.options.getInteger("case");
            const c=await cases.get(guildId, num);
            if(!c) return interaction.reply({ embeds:[embeds.error("Not found",`#${num}`)], flags: MessageFlags.Ephemeral});
            const notes=await cases.getCaseNotes(guildId, num).catch(()=>[]);
            const embed=new EmbedBuilder().setColor(Theme.accent).setTitle(`Case #${c.caseNumber} — ${c.action}`).setDescription(c.reason||"No reason").addFields(
                { name:"Target", value:`<@${c.targetId}> (${c.targetTag})`, inline:true },
                { name:"Moderator", value:`<@${c.moderatorId}>`, inline:true },
                { name:"Created", value:`<t:${Math.floor(new Date(c.createdAt).getTime()/1000)}:R>`, inline:true },
                { name:"Resolved", value: c.resolved? `By <@${c.resolvedById}>` :"No", inline:true },
                { name:"Duration", value: c.duration||"—", inline:true }
            ).setTimestamp();
            if(notes.length) embed.addFields({ name:"Notes", value: notes.map(n=> n.content.slice(0,200)).join("\n").slice(0,1024) });
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="note"){
            const user=interaction.options.getUser("user");
            const content=interaction.options.getString("content");
            const caseNum=interaction.options.getInteger("case");
            await cases.addNote(guildId, user.id, interaction.user.id, interaction.user.tag, content, caseNum);
            await interaction.client.services.audit?.log(guildId,{ actorId:interaction.user.id, targetId:user.id, action:"note_add", category:"moderation", details:{ content, caseNumber:caseNum }}).catch(()=>{});
            return interaction.reply({ embeds:[embeds.success("Note added",`For <@${user.id}>${caseNum?` on #${caseNum}`:""}`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="edit"){
            const num=interaction.options.getInteger("case");
            const reason=interaction.options.getString("reason");
            const c=await cases.edit(guildId, num, { reason });
            if(!c) return interaction.reply({ embeds:[embeds.error("Not found","")], flags: MessageFlags.Ephemeral});
            await interaction.client.services.audit?.log(guildId,{ actorId:interaction.user.id, action:"case_edit", category:"moderation", details:{ caseNumber:num, reason }}).catch(()=>{});
            return interaction.reply({ embeds:[embeds.success("Edited",`Case #${num} updated`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="stats"){
            const target=interaction.options.getUser("moderator");
            if(target){
                const s=await mod.getModStats(guildId, target.id);
                const embed=new EmbedBuilder().setColor(Theme.accent).setAuthor({ name:`${target.tag} — Mod Stats`, iconURL: target.displayAvatarURL()}).setDescription(`**${s.count}** cases`).addFields({ name:"Recent", value: s.recent.map(c=>`#${c.caseNumber} ${c.action} <t:${Math.floor(new Date(c.createdAt).getTime()/1000)}:R>`).join("\n").slice(0,1024) || "—"});
                return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
            } else {
                const s=await cases.stats(guildId);
                const embed=new EmbedBuilder().setColor(Theme.accent).setTitle("Moderation Statistics").setDescription(`**${s.total}** total cases`).addFields(
                    { name:"By Action", value: s.byAction.map(a=> `${a.action}: ${a._count._all}`).join("\n") || "—", inline:true },
                    { name:"Top Mods", value: s.topMods.map(m=> `<@${m.moderatorId}>: ${m._count._all}`).join("\n") || "—", inline:true }
                );
                return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
            }
        }
        if(sub==="thresholds"){
            const patch={};
            for(const k of ["warn","timeout","kick","ban"]){
                const v=interaction.options.getInteger(k);
                if(v!==null){ if(v<1||v>100) return interaction.reply({ embeds:[embeds.error("Invalid",`${k} 1-100`)], flags: MessageFlags.Ephemeral}); patch[k]=v; }
            }
            if(Object.keys(patch).length===0){
                const cur=await mod.getThresholds(guildId);
                return interaction.reply({ embeds:[embeds.info("Thresholds", `warn:${cur.warn} timeout:${cur.timeout} kick:${cur.kick} ban:${cur.ban}`)], flags: MessageFlags.Ephemeral});
            }
            // Confirmation for destructive lowering?
            await mod.setThresholds(guildId, patch);
            return interaction.reply({ embeds:[embeds.success("Updated", Object.entries(patch).map(([k,v])=>`${k}:${v}`).join(" "))], flags: MessageFlags.Ephemeral});
        }
        if(sub==="appeals"){
            const status=interaction.options.getString("status");
            const list=await cases.listAppeals(guildId, status);
            const embed=new EmbedBuilder().setColor(Theme.accent).setTitle(`Appeals ${status||"All"}`).setDescription(list.length? list.map(a=>`Case #${a.caseNumber} by <@${a.appellantId}> — ${a.status} ${a.reason.slice(0,60)}`).join("\n") : "No appeals found.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
    }
};
