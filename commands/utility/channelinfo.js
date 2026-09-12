import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, ChannelType } from "discord.js";

const PERMISSION_OVERWRITE_ROLE = 0;
import { panel, stat } from "../../ui/embeds.js";

const CHANNEL_TYPES = {
    [ChannelType.GuildText]: "Text",
    [ChannelType.GuildVoice]: "Voice",
    [ChannelType.GuildCategory]: "Category",
    [ChannelType.AnnouncementChannel]: "Announcement",
    [ChannelType.GuildStageVoice]: "Stage",
    [ChannelType.GuildForum]: "Forum",
};

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("channelinfo")
        .setDescription("View channel information")
        .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(false)),
    async execute(interaction) {
        const ch = interaction.options.getChannel("channel") ?? interaction.channel;
        const type = CHANNEL_TYPES[ch.type] ?? "Unknown";
        const category = ch.parent ? ch.parent.name : "None";

        const embed = panel(`#${ch.name}`, "")
            .addFields(
                stat("Type", type),
                stat("Category", category),
                stat("NSFW", ch.isTextBased() && ch.nsfw !== undefined ? (ch.nsfw ? "Yes" : "No") : "N/A"),
                stat("Slowmode", ch.isTextBased() && ch.rateLimitPerUser ? `${ch.rateLimitPerUser}s` : "Off"),
                stat("Created", `<t:${Math.floor(ch.createdAt.getTime() / 1000)}:R>`),
            );

        if (ch.topic) embed.addFields({ name: "Topic", value: ch.topic.slice(0, 1024) });

        const perms = ch.permissionOverwrites.cache.filter(p => p.type === PERMISSION_OVERWRITE_ROLE);
        if (perms.size > 0) {
            const rolePerms = perms.filter(p => p.id !== ch.guild?.roles?.everyone?.id);
            embed.addFields({ name: `Permissions (${rolePerms.size} roles)`, value: rolePerms.size > 5 ? `${rolePerms.size} role overrides` : "Default" });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
