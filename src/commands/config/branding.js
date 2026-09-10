import { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("branding").setDescription("Per-server bot name & avatar (not global)")
        .addSubcommand(s=> s.setName("view").setDescription("View current branding"))
        .addSubcommand(s=> s.setName("set").setDescription("Set branding")
            .addStringOption(o=>o.setName("name").setDescription("Display name (2-32 chars)").setMinLength(2).setMaxLength(32))
            .addStringOption(o=>o.setName("avatar").setDescription("Avatar image URL"))
            .addAttachmentOption(o=>o.setName("avatar_file").setDescription("Upload avatar image"))
            .addStringOption(o=>o.setName("banner").setDescription("Banner image URL for ORDER-HERE"))
            .addAttachmentOption(o=>o.setName("banner_file").setDescription("Upload banner"))
            .addStringOption(o=>o.setName("nickname").setDescription("Server nickname (overrides display name)")))
        .addSubcommand(s=> s.setName("reset").setDescription("Reset to default")),
    category:"Config",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const guild=interaction.guild;
        const cfg=await interaction.client.services.settings.get(guild.id).catch(()=>null);
        if(!isStaff(interaction.member, cfg)) return interaction.reply({ embeds:[embeds.error("No permission","Staff only — ManageGuild/Administrator or staff role")], flags: MessageFlags.Ephemeral});
        const branding=interaction.client.services.branding;
        if(sub==="view"){
            const b=await branding.get(guild.id);
            const disp=await branding.getDisplay(guild);
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setTitle(`Branding — ${guild.name}`).setThumbnail(disp.icon)
                .addFields(
                    { name:"Display Name", value: b.displayName || `*Default: ${interaction.client.user.username}*`, inline:true },
                    { name:"Nickname", value: b.nickname || "*None*", inline:true },
                    { name:"Avatar", value: b.avatarUrl ? `[Link](${b.avatarUrl})` : "*Default bot avatar*", inline:true },
                    { name:"Banner", value: b.bannerUrl ? `[Link](${b.bannerUrl})` : "*Default ORDER-HERE*", inline:true }
                ).setFooter({ text:"Per-server. Not global."}).setTimestamp();
            if(b.avatarUrl) embed.setImage(b.avatarUrl);
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="reset"){
            await branding.set(guild.id, { displayName:null, avatarUrl:null, bannerUrl:null, nickname:null });
            try{ await guild.members.me.setNickname(null).catch(()=>{}); }catch{}
            return interaction.reply({ embeds:[embeds.success("Reset","Branding cleared to global defaults")], flags: MessageFlags.Ephemeral});
        }
        if(sub==="set"){
            await interaction.deferReply({ flags: MessageFlags.Ephemeral}).catch(()=>{});
            const name=interaction.options.getString("name");
            const nick=interaction.options.getString("nickname");
            let avatarUrl=interaction.options.getString("avatar");
            let bannerUrl=interaction.options.getString("banner");
            const avatarFile=interaction.options.getAttachment("avatar_file");
            const bannerFile=interaction.options.getAttachment("banner_file");
            // Handle file uploads via asset service for persistence
            if(avatarFile){
                const res=await interaction.client.services.assets.persistAttachment(guild, avatarFile).catch(e=>null);
                if(res?.url) avatarUrl=res.url;
                else avatarUrl=avatarFile.url;
            }
            if(bannerFile){
                const res=await interaction.client.services.assets.persistAttachment(guild, bannerFile).catch(e=>null);
                if(res?.url) bannerUrl=res.url;
                else bannerUrl=bannerFile.url;
            }
            const patch={};
            if(name!==null) patch.displayName=name;
            if(nick!==null) patch.nickname=nick;
            if(avatarUrl!==null) patch.avatarUrl=avatarUrl;
            if(bannerUrl!==null) patch.bannerUrl=bannerUrl;
            await branding.set(guild.id, patch);
            if(nick!==null || name!==null){
                const effective=nick || name;
                if(effective) await guild.members.me.setNickname(effective).catch(()=>{});
            }
            const updated=await branding.get(guild.id);
            const disp=await branding.getDisplay(guild);
            const embed=new EmbedBuilder().setColor(0x6ee7b7).setTitle("Branding updated").setThumbnail(disp.icon)
                .addFields(
                    { name:"Name", value: updated.displayName||"*default*", inline:true },
                    { name:"Nickname", value: updated.nickname||"*none*", inline:true },
                    { name:"Avatar", value: updated.avatarUrl? "Custom" : "Default", inline:true }
                ).setFooter({ text:"Per-server • will show in tickets & embeds"});
            if(updated.bannerUrl) embed.setImage(updated.bannerUrl);
            await interaction.editReply({ embeds:[embed] }).catch(()=>{});
            await interaction.client.services.audit?.log(guild.id,{ actorId:interaction.user.id, action:"branding_update", category:"config", details:patch }).catch(()=>{});
            return;
        }
    }
};
