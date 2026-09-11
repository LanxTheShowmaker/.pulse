import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ChannelType } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

const CHANNEL_TYPES = {
    [ChannelType.GuildText]: "Text",
    [ChannelType.GuildVoice]: "Voice",
    [ChannelType.GuildCategory]: "Category",
    [ChannelType.GuildAnnouncement]: "Announcement",
    [ChannelType.AnnouncementThread]: "Announcement Thread",
    [ChannelType.PublicThread]: "Public Thread",
    [ChannelType.PrivateThread]: "Private Thread",
    [ChannelType.GuildStageVoice]: "Stage Voice",
    [ChannelType.GuildForum]: "Forum",
    [ChannelType.GuildMedia]: "Media",
};

export default {
    data: new SlashCommandBuilder()
        .setName("channelinfo")
        .setDescription("Inspect a channel's type, category, permissions, and settings")
        .addChannelOption(o => o.setName("channel").setDescription("Channel to inspect (defaults to current)").setRequired(false)),
    category: "Utility",
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ embeds: [embeds.error("Guild only", "Use in a server")], flags: MessageFlags.Ephemeral });

        const channel = interaction.options.getChannel("channel") ?? interaction.channel;
        if (!channel) return interaction.reply({ embeds: [embeds.error("Not found", "Channel not found")], flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const type = CHANNEL_TYPES[channel.type] ?? `Unknown (${channel.type})`;
        const category = channel.parent ? `<#${channel.parent.id}>` : "None";
        const position = channel.position;
        const created = channel.createdAt ? `<t:${Math.floor(channel.createdAt.getTime() / 1000)}:R>` : "—";

        const fields = [
            { name: "ID", value: `\`${channel.id}\``, inline: true },
            { name: "Type", value: `> ${type}`, inline: true },
            { name: "Category", value: `> ${category}`, inline: true },
            { name: "Position", value: `> **${position}**`, inline: true },
            { name: "Created", value: `> ${created}`, inline: true },
        ];

        if (channel.isTextBased() && !channel.isVoiceBased()) {
            const nsfw = channel.nsfw ? "Yes" : "No";
            const slowmode = channel.rateLimitPerUser ? `${channel.rateLimitPerUser}s` : "None";
            const topic = channel.topic ? channel.topic.slice(0, 200) : "—";
            fields.push(
                { name: "NSFW", value: `> ${nsfw}`, inline: true },
                { name: "Slowmode", value: `> ${slowmode}`, inline: true },
                { name: "Topic", value: `> ${topic}` },
            );
        }

        if (channel.isVoiceBased()) {
            const bitrate = channel.bitrate ? `${channel.bitrate / 1000}kbps` : "—";
            const userLimit = channel.userLimit ? `${channel.userLimit}` : "Unlimited";
            const vcMembers = channel.members?.size ?? 0;
            fields.push(
                { name: "Bitrate", value: `> ${bitrate}`, inline: true },
                { name: "User Limit", value: `> ${userLimit}`, inline: true },
                { name: "Connected", value: `> **${vcMembers}**`, inline: true },
            );
        }

        if (channel.isThread()) {
            const thread = channel;
            const owner = thread.ownerId ? `<@${thread.ownerId}>` : "—";
            const archived = thread.archived ? "Yes" : "No";
            const autoArchive = thread.autoArchiveDuration ? `${thread.autoArchiveDuration}min` : "—";
            fields.push(
                { name: "Owner", value: `> ${owner}`, inline: true },
                { name: "Archived", value: `> ${archived}`, inline: true },
                { name: "Auto-Archive", value: `> ${autoArchive}`, inline: true },
            );
            if (thread.messageCount !== undefined) {
                fields.push({ name: "Messages", value: `> **${thread.messageCount}**`, inline: true });
            }
        }

        if (channel.isForum()) {
            const defaultReaction = channel.defaultReactionEmoji ? channel.defaultReactionEmoji.name ?? "—" : "None";
            const defaultSort = channel.defaultSortOrder !== null ? String(channel.defaultSortOrder) : "—";
            fields.push(
                { name: "Default Reaction", value: `> ${defaultReaction}`, inline: true },
                { name: "Default Sort", value: `> ${defaultSort}`, inline: true },
            );
        }

        const overrides = channel.permissionOverwrites.cache;
        const roleOverwrites = overrides.filter(o => o.type === 0);
        const memberOverwrites = overrides.filter(o => o.type === 1);
        fields.push(
            { name: "Permission Overrides", value: `> **${roleOverwrites.size}** roles, **${memberOverwrites.size}** members`, inline: true },
        );

        const embed = new EmbedBuilder()
            .setColor(Theme.info)
            .setAuthor({ name: "Channel Information", iconURL: guild.iconURL({ size: 64 }) ?? undefined })
            .setTitle(`#${channel.name}`)
            .addFields(fields)
            .setFooter({ text: guild.name })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
};
