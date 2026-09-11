import { SlashCommandBuilder, MessageFlags, ChannelType } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("logs").setDescription("Logging")
        .addSubcommand(s=> s.setName("setup").setDescription("Set log channel").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption(o=>o.setName("type").setDescription("Type").setRequired(true).addChoices({name:"Log",value:"log"},{name:"ModLog",value:"mod"})))
        .addSubcommand(s=> s.setName("settings").setDescription("Show settings"))
        .addSubcommand(s=> s.setName("test").setDescription("Test log"))
        .addSubcommand(s=> s.setName("status").setDescription("Status"))
        .addSubcommand(s=> s.setName("events").setDescription("Events list"))
        .addSubcommand(s=> s.setName("search").setDescription("Search logs").addStringOption(o=>o.setName("query").setDescription("Query"))),
    category:"Config",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(sub!=="status" && !isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("Staff only","")], flags: MessageFlags.Ephemeral});
        if(sub==="setup"){
            const ch=interaction.options.getChannel("channel",true); const type=interaction.options.getString("type",true);
            const patch= type==="mod"? { modLogChannelId: ch.id } : { logChannelId: ch.id };
            await interaction.client.services.settings.patch(interaction.guildId, patch);
            return interaction.reply({ embeds:[embeds.success("Set",`${type} → <#${ch.id}>`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="settings"||sub==="status"){
            const c=await interaction.client.services.settings.get(interaction.guildId);
            return interaction.reply({ embeds:[embeds.info("Logs",`Log: ${c.logChannelId? "<#"+c.logChannelId+">":"—"} \nMod: ${c.modLogChannelId? "<#"+c.modLogChannelId+">":"—"}`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="test"){
            const ch=await interaction.client.services.logging.channel(interaction.guild, "mod");
            if(!ch) return interaction.reply({ embeds:[embeds.error("No channel","Set first")], flags: MessageFlags.Ephemeral});
            await ch.send({ embeds:[embeds.info("Test","Logging works")] });
            return interaction.reply({ embeds:[embeds.success("Sent","Test sent")], flags: MessageFlags.Ephemeral});
        }
        if(sub==="events") return interaction.reply({ embeds:[embeds.info("Events","join, leave, moderation, tickets, automod")] , flags: MessageFlags.Ephemeral});
        if(sub==="search"){
            const q=interaction.options.getString("query")||"";
            const logs=await interaction.client.services.audit.timeline(interaction.guildId,{ limit:10 }).catch(()=>[]);
            const filtered=logs.filter(l=> l.action.includes(q) || l.category.includes(q));
            return interaction.reply({ embeds:[embeds.info("Search", filtered.map(l=> `${l.category}/${l.action}`).join("\n")||"No matching log entries found.")], flags: MessageFlags.Ephemeral});
        }
    }
};