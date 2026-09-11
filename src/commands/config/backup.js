import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";
import { embeds, confirmationRow } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("backup").setDescription("Backup / Restore")
        .addSubcommand(s=> s.setName("create").setDescription("Create backup"))
        .addSubcommand(s=> s.setName("list").setDescription("List backups"))
        .addSubcommand(s=> s.setName("restore").setDescription("Restore backup").addStringOption(o=>o.setName("id").setDescription("Backup ID").setRequired(true))),
    category:"Config",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
        const svc=interaction.client.services.backup;
        if(sub==="create"){
            await interaction.deferReply({ flags: MessageFlags.Ephemeral}).catch(()=>{});
            const b=await svc.create(interaction.guildId, interaction.user).catch(e=>null);
            if(!b) return interaction.editReply({ embeds:[embeds.error("Failed","Could not create backup")]});
            return interaction.editReply({ embeds:[embeds.success("Backup created", `ID \`${b.id}\` at <t:${Math.floor(new Date(b.createdAt).getTime()/1000)}:R>`)]});
        }
        if(sub==="list"){
            const list=await svc.list(interaction.guildId,10);
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setTitle("Backups").setDescription(list.length? list.map(b=> `\`${b.id}\` <t:${Math.floor(new Date(b.createdAt).getTime()/1000)}:R> by <@${b.createdById}>`).join("\n") : "No backups found. Create one with /backup create.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="restore"){
            if(!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)){
                return interaction.reply({ embeds:[embeds.error("No perm","Administrator or Manage Server required")], flags: MessageFlags.Ephemeral});
            }
            const id=interaction.options.getString("id");
            const backup=await svc.get(interaction.guildId, id);
            if(!backup) return interaction.reply({ embeds:[embeds.error("Not found",id)], flags: MessageFlags.Ephemeral});
            // Confirm
            const row=confirmationRow({ acceptCustomId:`backup:restore:${id}:yes`, cancelCustomId:`backup:restore:${id}:no`, danger:true, acceptLabel:"Restore", cancelLabel:"Cancel" });
            const embed=embeds.warn("Confirm restore", `Restore backup \`${id}\` from <t:${Math.floor(new Date(backup.createdAt).getTime()/1000)}:R>? This will overwrite config.`);
            const msg=await interaction.reply({ embeds:[embed], components:[row], flags: MessageFlags.Ephemeral});
            const reply=await interaction.fetchReply().catch(()=>null);
            if(!reply) return;
            const collector=reply.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time:30000, max:1 });
            collector.on("collect", async i=>{
                if(i.customId.endsWith(":no")) return i.update({ embeds:[embeds.info("Cancelled","Not restored")], components:[]}).catch(()=>{});
                await i.deferUpdate().catch(()=>{});
                try{ await svc.restore(interaction.guildId, id, interaction.user, { confirm:true }); await i.editReply({ embeds:[embeds.success("Restored",`Backup \`${id}\` restored`)], components:[]}).catch(()=>{}); }catch(e){ await i.editReply({ embeds:[embeds.error("Failed",String(e.message).slice(0,500))], components:[]}).catch(()=>{}); }
            });
            collector.on("end", c=>{ if(c.size===0) interaction.editReply({ components:[]}).catch(()=>{}); });
        }
    }
};
