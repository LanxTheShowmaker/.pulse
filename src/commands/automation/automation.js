import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags, TextInputStyle } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
const TRIGGERS=["levelUp","memberJoin","ticketCreate","ticketClose","economyPurchase","messageCreate"];
const ACTIONS=["give_role","send_message","log","transcript"];
export default {
    data: new SlashCommandBuilder().setName("automation").setDescription("Event automation engine")
        .addSubcommand(s=> s.setName("list").setDescription("List rules"))
        .addSubcommand(s=> s.setName("create").setDescription("Create rule")
            .addStringOption(o=>o.setName("trigger").setDescription("When").setRequired(true).addChoices(...TRIGGERS.map(t=>({name:t,value:t}))))
            .addStringOption(o=>o.setName("name").setDescription("Name"))
            .addStringOption(o=>o.setName("conditions").setDescription("JSON conditions"))
            .addStringOption(o=>o.setName("actions").setDescription("JSON actions array")))
        .addSubcommand(s=> s.setName("delete").setDescription("Delete rule").addStringOption(o=>o.setName("id").setDescription("Rule ID").setRequired(true)))
        .addSubcommand(s=> s.setName("toggle").setDescription("Enable/disable").addStringOption(o=>o.setName("id").setDescription("ID").setRequired(true)).addBooleanOption(o=>o.setName("enabled").setDescription("Enabled").setRequired(true))),
    category:"Config",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
        const svc=interaction.client.services.automation;
        if(sub==="list"){
            const list=await svc.list(interaction.guildId);
            const embed=new EmbedBuilder().setColor(0x9b8ecf).setTitle("Automation Rules").setDescription(list.length? list.map(r=> `\`${r.id.slice(0,8)}\` **${r.name||r.trigger}** \`${r.trigger}\` ${r.enabled?"🟢":"🔴"}\n${r.actions.slice(0,120)}`).join("\n\n") : "No automation rules configured. Create one with /automation create.");
            return interaction.reply({ embeds:[embed], flags: MessageFlags.Ephemeral});
        }
        if(sub==="create"){
            const trigger=interaction.options.getString("trigger");
            const name=interaction.options.getString("name");
            let cond={}, acts=[];
            try{ cond=JSON.parse(interaction.options.getString("conditions")||"{}"); }catch{ return interaction.reply({ embeds:[embeds.error("Invalid JSON","conditions must be JSON")], flags: MessageFlags.Ephemeral}); }
            try{ acts=JSON.parse(interaction.options.getString("actions")||"[]"); }catch{ return interaction.reply({ embeds:[embeds.error("Invalid JSON","actions must be JSON array")], flags: MessageFlags.Ephemeral}); }
            const rule=await svc.create(interaction.guildId,{ name, trigger, conditions:cond, actions:acts });
            return interaction.reply({ embeds:[embeds.success("Created", `Rule \`${rule.id}\` trigger \`${trigger}\``)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="delete"){
            const id=interaction.options.getString("id");
            await svc.delete(interaction.guildId, id);
            return interaction.reply({ embeds:[embeds.success("Deleted",id)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="toggle"){
            const id=interaction.options.getString("id"); const en=interaction.options.getBoolean("enabled");
            await svc.toggle(interaction.guildId, id, en);
            return interaction.reply({ embeds:[embeds.success("Toggled",`${id} → ${en?"enabled":"disabled"}`)], flags: MessageFlags.Ephemeral});
        }
    }
};
