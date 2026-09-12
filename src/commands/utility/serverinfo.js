import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, ChannelType } from "discord.js";
import { panel, stat } from "../../design/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Detailed server information"),
    async execute(interaction) {
        const g = interaction.guild;
        const online = g.members.cache.filter(m => m.presence?.status !== "offline").size;
        const textChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

        const features = g.features.length
            ? g.features.map(f => `\`${f}\``).join(", ")
            : "None";

        const embed = panel(g.name, "")
            .addFields(
                { name: "\uD83C\uDFE0 General", value: "\u200B", inline: false },
                stat("Owner", `<@${g.ownerId}>`),
                stat("Created", `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`),
                stat("Verification", g.verificationLevel.toString()),
                { name: "\uD83D\uDCCA Stats", value: "\u200B", inline: false },
                stat("Members", `${g.memberCount} (${online} online)`),
                stat("Channels", `${textChannels} text, ${voiceChannels} voice, ${categories} categories`),
                stat("Roles", `${g.roles.cache.size}`),
                stat("Emojis", `${g.emojis.cache.size}`),
                { name: "\uD83D\uDE80 Boosts", value: `\`${g.premiumSubscriptionCount ?? 0}\` (Tier ${g.premiumTier})`, inline: true },
                { name: "\uD83C\uDFAF Features", value: features, inline: false },
            );
        if (g.iconURL()) embed.setThumbnail(g.iconURL({ size: 256 }));
        if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 512 }));

        await interaction.reply({ embeds: [embed] });
    },
};
