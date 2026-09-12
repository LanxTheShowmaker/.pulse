import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, ChannelType } from "discord.js";
import { panel, stat } from "../../design/embeds.js";

const CHANNEL_TYPES = {
    0: "Text", 2: "Voice", 4: "Category", 5: "Announcement",
    13: "Stage", 15: "Forum",
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

        const perms = ch.permissionOverwrites.cache.filter(p => p.type === 0);
        if (perms.size > 0) {
            const rolePerms = perms.filter(p => p.id !== ch.guild?.roles?.everyone?.id);
            embed.addFields({ name: `Permissions (${rolePerms.size} roles)`, value: rolePerms.size > 5 ? `${rolePerms.size} role overrides` : "Default" });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
