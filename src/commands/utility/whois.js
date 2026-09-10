import { SlashCommandBuilder, MessageFlags, time, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";
export default {
    data: new SlashCommandBuilder()
        .setName("whois")
        .setDescription("Show user information (works for any user, even if not cached)")
        .addUserOption(o=> o.setName("user").setDescription("User to lookup").setRequired(false))
        .addStringOption(o=> o.setName("userid").setDescription("User ID (for users who left)").setRequired(false)),
    category:"Utility",
    async execute(interaction){
        const guild=interaction.guild;
        if(!guild) return interaction.reply({ embeds:[embeds.error("Guild only","Use in a server")], flags: MessageFlags.Ephemeral});
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        // Resolve target: prefer user option, then userid, then self
        let targetUser=null;
        let targetId=null;
        const optUser=interaction.options.getUser("user");
        const optId=interaction.options.getString("userid");
        if(optUser){
            targetUser=optUser;
            targetId=optUser.id;
        } else if(optId){
            targetId=optId.trim();
            // Validate snowflake
            if(!/^\d{17,20}$/.test(targetId)){
                return interaction.editReply({ embeds:[embeds.error("Invalid ID","User ID must be 17-20 digits")] }).catch(()=>{});
            }
            try{
                targetUser=await interaction.client.users.fetch(targetId).catch(()=>null);
                if(!targetUser) targetUser={ id: targetId, tag: `Unknown#0000 (${targetId})`, username: "Unknown", displayAvatarURL: ()=> interaction.client.user.displayAvatarURL(), createdAt: new Date(0), globalName: null };
            }catch(e){
                return interaction.editReply({ embeds:[embeds.error("Not found",`Could not fetch user \`${targetId}\` — ${e.message.slice(0,120)}`)] }).catch(()=>{});
            }
        } else {
            targetUser=interaction.user;
            targetId=interaction.user.id;
        }
        // Ensure we have user object with needed props
        if(!targetUser) {
            try{ targetUser=await interaction.client.users.fetch(targetId).catch(()=>null); }catch{}
        }
        if(!targetUser) return interaction.editReply({ embeds:[embeds.error("Failed","Could not resolve user")] }).catch(()=>{});
        // Try to fetch member (may be not in guild or not cached)
        let member=null;
        let memberFetchError=null;
        try{
            member=await guild.members.fetch(targetId).catch(e=>{ memberFetchError=e; return null; });
            if(!member){
                // Try cache
                member=guild.members.cache.get(targetId) || null;
            }
        }catch(e){ memberFetchError=e; }
        // Build roles string with graceful handling
        let rolesStr="—";
        let joinStr="—";
        let nickStr="—";
        if(member){
            try{
                const roles=member.roles.cache.filter(r=> r.id!==guild.id).sort((a,b)=> b.position-a.position).first(10).map(r=> r.toString()).join(", ");
                rolesStr=roles || "—";
                joinStr=member.joinedAt ? time(member.joinedAt,"R") : "—";
                nickStr=member.nickname ?? "—";
            }catch(e){ rolesStr="—"; }
        } else {
            // Not in guild
            if(memberFetchError && memberFetchError.code===10007) joinStr="Not in server (left)";
            else joinStr="Not in server";
        }
        const e=new EmbedBuilder().setColor(Theme.info).setAuthor({ name:`User Information`, iconURL: guild.iconURL({ size:64 }) ?? undefined }).setTitle(`✦  ${targetUser.username ?? targetUser.tag}`)
            .setThumbnail(targetUser.displayAvatarURL ? targetUser.displayAvatarURL({ size:256, forceStatic:false }) : guild.iconURL({ size:256 }) )
            .addFields(
                { name:"  ID", value:`\`${targetUser.id}\``, inline:true },
                { name:"  Tag", value:`> ${targetUser.tag ?? `${targetUser.username}#${targetUser.discriminator??"0"}`}`, inline:true },
                { name:"  Global", value:`> ${targetUser.globalName ?? "—"}`, inline:true },
                { name:"  Nickname", value:`> ${nickStr}`, inline:true },
                { name:"  Joined Server", value:`> ${joinStr}`, inline:true },
                { name:"  Created Account", value:`> ${targetUser.createdAt ? time(targetUser.createdAt,"R") : "—"}`, inline:true },
                { name:"  Roles", value:`> ${rolesStr}` }
            ).setFooter({ text:`Requested by ${interaction.user.tag} • ${guild.name}` , iconURL: interaction.user.displayAvatarURL()}).setTimestamp();
        // Handle missing avatar
        try{ e.setThumbnail(targetUser.displayAvatarURL({ size:256 })); }catch{}
        return interaction.editReply({ embeds:[e] }).catch(()=>{});
    }
};
