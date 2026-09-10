import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
export async function getHealthEmbed(guildId, client){
    const h=await client.services.diagnostics.health(guildId).catch(()=>({overall:"ERROR", errors:1, warns:0, total:0}));
    const col=h.overall==="OK"?0x6ee7b7:h.overall==="WARNING"?0xfbbf24:0xf87171;
    const e=new EmbedBuilder().setColor(col).setTitle(`Health — ${h.overall}`).setDescription(`${h.errors} errors • ${h.warns} warnings • ${h.total} checks`).setTimestamp();
    return e;
}
export default {
    data: new SlashCommandBuilder().setName("health").setDescription("Bot health — quick status"),
    category:"Utility",
    async execute(interaction){
        const e=await getHealthEmbed(interaction.guildId, interaction.client);
        return interaction.reply({ embeds:[e], flags: MessageFlags.Ephemeral});
    }
};
