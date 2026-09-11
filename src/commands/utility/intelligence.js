import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("intelligence").setDescription("Intelligence engine")
        .addSubcommand(s=> s.setName("status").setDescription("Status"))
        .addSubcommand(s=> s.setName("rules").setDescription("Rules"))
        .addSubcommand(s=> s.setName("test").setDescription("Test").addStringOption(o=>o.setName("content").setDescription("Content").setRequired(true)))
        .addSubcommand(s=> s.setName("incidents").setDescription("Incidents"))
        .addSubcommand(s=> s.setName("settings").setDescription("Settings")),
    category:"Utility",
    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        const intel=interaction.client.services.intelligence;
        if(sub==="status") return interaction.reply({ embeds:[embeds.info("Intelligence","Heuristics, scoring, pattern detection — no LLM, deterministic")], flags: MessageFlags.Ephemeral});
        if(sub==="rules") return interaction.reply({ embeds:[embeds.info("Rules","spam, flood, caps, links, invites, raid, account age")], flags: MessageFlags.Ephemeral});
        if(sub==="test"){
            const content=interaction.options.getString("content",true);
            const res=intel.scoreMessage({ content, mentions:{ users:{size:0}, roles:{size:0}, everyone:false }});
            return interaction.reply({ embeds:[embeds.info("Test",`Score ${res.score} ${res.level} — ${res.reasons.join(", ")}`)], flags: MessageFlags.Ephemeral});
        }
        if(sub==="incidents"){
            const inc=await interaction.client.prisma.raidIncident.findMany({ where:{ guildId: interaction.guildId }, take:5, orderBy:{ createdAt:"desc" }}).catch(()=>[]);
            return interaction.reply({ embeds:[embeds.info("Incidents", inc.map(i=> i.type+" "+i.risk).join("\n")||"None")], flags: MessageFlags.Ephemeral});
        }
        if(sub==="settings") return interaction.reply({ embeds:[embeds.info("Settings","Configure via /automod")], flags: MessageFlags.Ephemeral});
    }
};