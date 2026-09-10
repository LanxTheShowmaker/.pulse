import { SlashCommandBuilder, MessageFlags, time, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

async function buildServerEmbed(guild){
    const e = embeds.panel(`✦  ${guild.name}`, `*Server information.*`, [
        { name: "  ID", value: `\`${guild.id}\``, inline: true },
        { name: "  Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "  Members", value: `> **${guild.memberCount}**`, inline: true },
        { name: "  Boosts", value: `> **${guild.premiumSubscriptionCount ?? 0}**`, inline: true },
        { name: "  Channels", value: `> **${guild.channels.cache.size}**`, inline: true },
        { name: "  Roles", value: `> **${guild.roles.cache.size}**`, inline: true },
        { name: "  Created", value: `> ${time(guild.createdAt, "R")}`, inline: true },
    ], { author: { name: `Server Information`, iconURL: guild.iconURL({ size: 64 }) ?? undefined } });
    e.setThumbnail(guild.iconURL({ size: 256 }) ?? null);
    e.setColor(Theme.panel);
    return e;
}

export async function getServerInfo(guild){
    return buildServerEmbed(guild);
}

export default {
    data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
    category:"Utility",
    async execute(interaction){
        const guild=interaction.guild;
        if(!guild) return interaction.reply({ embeds:[embeds.error("Guild only","Use in a server")], flags: MessageFlags.Ephemeral});
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        const e=await buildServerEmbed(guild);
        return interaction.editReply({ embeds:[e] }).catch(()=>{});
    }
};
