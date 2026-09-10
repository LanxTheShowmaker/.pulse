import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
import { Theme } from "../../design/theme.js";
const ALL=["moderation","automod","tickets","leveling","economy","welcome","starboard","reactionRoles","analytics","achievements","automation","giveaways","suggestions","afk"];
export default {
    data: new SlashCommandBuilder().setName("modules").setDescription("Module system — enable/disable features")
        .addSubcommand(s=> s.setName("list").setDescription("List module statuses"))
        .addSubcommand(s=> s.setName("enable").setDescription("Enable module").addStringOption(o=>o.setName("module").setDescription("Module").setRequired(true).addChoices(...ALL.map(m=>({name:m,value:m})))))
        .addSubcommand(s=> s.setName("disable").setDescription("Disable module").addStringOption(o=>o.setName("module").setDescription("Module").setRequired(true).addChoices(...ALL.map(m=>({name:m,value:m})))))
        .addSubcommand(s=> s.setName("preset").setDescription("Apply preset").addStringOption(o=>o.setName("preset").setDescription("Preset").setRequired(true).addChoices({name:"Full",value:"full"},{name:"Minimal",value:"minimal"},{name:"Light",value:"light"}))),
    category:"Config",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(interaction.member, cfg)) return interaction.reply({ embeds:[embeds.error("No permission","Staff only")], flags: MessageFlags.Ephemeral});
        if(sub==="list"){
            const mods=cfg.modules||{};
            const embed=new EmbedBuilder().setColor(Theme.panel).setTitle("Modules").setDescription(ALL.map(m=> `${mods[m]!==false?"🟢":"🔴"} **${m}**`).join("\n"));
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="enable"){
            const mod=interaction.options.getString("module");
            await interaction.client.services.settings.setModule(interaction.guildId, mod, true);
            return interaction.reply({ embeds:[embeds.success("Enabled",mod)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="disable"){
            const mod=interaction.options.getString("module");
            if(["moderation","logging"].includes(mod)) return interaction.reply({ embeds:[embeds.warn("Protected","Cannot disable core")], flags: MessageFlags.Ephemeral});
            await interaction.client.services.settings.setModule(interaction.guildId, mod, false);
            return interaction.reply({ embeds:[embeds.success("Disabled",mod)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="preset"){
            const preset=interaction.options.getString("preset");
            let next={};
            if(preset==="full") ALL.forEach(m=> next[m]=true);
            else if(preset==="minimal") { ALL.forEach(m=> next[m]=false); ["moderation","automod","logging","welcome"].forEach(m=> next[m]=true); }
            else if(preset==="light") { ALL.forEach(m=> next[m]=true); ["analytics","achievements","automation"].forEach(m=> next[m]=false); }
            await interaction.client.services.settings.patch(interaction.guildId,{ modules: next });
            return interaction.reply({ embeds:[embeds.success("Preset applied",preset)], flags: MessageFlags.Ephemeral});
        }
    }
};
