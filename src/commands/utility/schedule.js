import { SlashCommandBuilder, MessageFlags, ChannelType } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("schedule").setDescription("Scheduled announcements & temp voice")
        .addSubcommand(s=> s.setName("announce").setDescription("Schedule announcement").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption(o=>o.setName("message").setDescription("Message").setRequired(true)).addIntegerOption(o=>o.setName("delay").setDescription("Delay seconds 10-86400").setMinValue(10).setMaxValue(86400).setRequired(true)))
        .addSubcommand(s=> s.setName("tempvoice").setDescription("Create temp voice channel").addStringOption(o=>o.setName("name").setDescription("Name").setRequired(true)).addIntegerOption(o=>o.setName("limit").setDescription("User limit 0-99"))),
    category:"Utility",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
        if(sub==="announce"){
            const ch=interaction.options.getChannel("channel");
            const msg=interaction.options.getString("message");
            const delay=interaction.options.getInteger("delay");
            await interaction.reply({ embeds:[embeds.success("Scheduled",`In **${delay}s** to <#${ch.id}>`)], flags: MessageFlags.Ephemeral});
            const client = interaction.client;
            const guildId = interaction.guildId;
            const channelId = ch.id;
            const timer = setTimeout(async()=>{
                try{ const g = client.guilds.cache.get(guildId); const c = g ? await g.channels.fetch(channelId).catch(()=>null) : null; if(c?.isTextBased()) await c.send({ embeds:[embeds.info("Announcement",msg)] }); }catch{}
            }, delay*1000);
            if (timer.unref) timer.unref();
            await interaction.client.services.audit?.log(interaction.guildId,{ actorId:interaction.user.id, action:"schedule_announce", category:"automation", details:{ channelId:ch.id, delay }}).catch(()=>{});
            return;
        }
        if(sub==="tempvoice"){
            const name=interaction.options.getString("name");
            const limit=interaction.options.getInteger("limit")||0;
            try{
                const ch=await interaction.guild.channels.create({ name, type: ChannelType.GuildVoice, userLimit: limit });
                await interaction.reply({ embeds:[embeds.success("Created",`<#${ch.id}> *auto-deletes when empty*`)], flags: MessageFlags.Ephemeral});
                // Simple watcher: delete when empty after 60s idle
                const sClient = interaction.client;
                const sGuildId = interaction.guildId;
                const watcher=setInterval(async()=>{
                    try{
                        const g = sClient.guilds.cache.get(sGuildId);
                        const fresh = g ? await g.channels.fetch(ch.id).catch(()=>null) : null;
                        if(!fresh || fresh.members.size===0){
                            await fresh?.delete().catch(()=>{});
                            clearInterval(watcher);
                        }
                    }catch{ clearInterval(watcher); }
                }, 60*1000);
                if (watcher.unref) watcher.unref();
                const cap = setTimeout(()=> clearInterval(watcher), 6*3600*1000);
                if (cap.unref) cap.unref();
            }catch(e){ return interaction.reply({ embeds:[embeds.error("Failed", e.message)], flags: MessageFlags.Ephemeral}); }
        }
    }
};
