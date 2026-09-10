import { SlashCommandBuilder, MessageFlags, ChannelType } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("welcome").setDescription("Welcome system")
        .addSubcommand(s=> s.setName("setup").setDescription("Set welcome channel").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s=> s.setName("test").setDescription("Test welcome"))
        .addSubcommand(s=> s.setName("preview").setDescription("Preview"))
        .addSubcommand(s=> s.setName("disable").setDescription("Disable")),
    category:"Config",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("Staff only","")], flags: MessageFlags.Ephemeral});
        if(sub==="setup"){
            const ch=interaction.options.getChannel("channel",true);
            await interaction.client.services.settings.patch(interaction.guildId,{ welcomeChannelId: ch.id });
            return interaction.reply({ embeds:[embeds.success("Set","Welcome → <#"+ch.id+">")], flags: MessageFlags.Ephemeral});
        }
        if(sub==="test"){
            await interaction.client.services.welcome.handleJoin(interaction.member).catch(()=>{});
            return interaction.reply({ embeds:[embeds.success("Tested","Sent")], flags: MessageFlags.Ephemeral});
        }
        if(sub==="preview") return interaction.reply({ embeds:[embeds.info("Preview","Welcome preview — join/leave messages")], flags: MessageFlags.Ephemeral});
        if(sub==="disable"){
            await interaction.client.services.settings.patch(interaction.guildId,{ welcomeChannelId: null });
            return interaction.reply({ embeds:[embeds.success("Disabled","Welcome messages disabled.")], flags: MessageFlags.Ephemeral});
        }
    }
};