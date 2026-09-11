import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, ChannelType } from "discord.js";
import { panel } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Detailed server information"),
    async execute(interaction) {
        const g = interaction.guild;
        const online = g.members.cache.filter(m => m.presence?.status !== "offline").size;
        const textChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

        const embed = panel(g.name, "")
            .addFields(
                { name: "ID", value: g.id, inline: true },
                { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
                { name: "Created", value: `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: "Members", value: `${g.memberCount} (${online} online)`, inline: true },
                { name: "Channels", value: `${textChannels} text, ${voiceChannels} voice, ${categories} categories`, inline: true },
                { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
                { name: "Emojis", value: `${g.emojis.cache.size}`, inline: true },
                { name: "Boosts", value: `${g.premiumSubscriptionCount ?? 0}`, inline: true },
                { name: "Verification", value: g.verificationLevel.toString(), inline: true },
            );
        if (g.iconURL()) embed.setThumbnail(g.iconURL({ size: 256 }));
        if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 512 }));

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
