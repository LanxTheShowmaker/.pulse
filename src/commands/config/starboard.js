import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from "discord.js";
import { containerReply } from "../../design/containers/base.js";
import { successPanel, errorPanel, infoPanel } from "../../design/containers/panels.js";

export default {
    data: new SlashCommandBuilder()
        .setName("starboard")
        .setDescription("Configure starboard")
        .addSubcommand(s => s
            .setName("set")
            .setDescription("Set starboard channel")
            .addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addIntegerOption(o => o.setName("threshold").setDescription("Stars needed").setMinValue(1).setMaxValue(20).setRequired(false))
            .addStringOption(o => o.setName("emoji").setDescription("Star emoji").setRequired(false))
        )
        .addSubcommand(s => s.setName("view").setDescription("View current starboard config"))
        .addSubcommand(s => s.setName("disable").setDescription("Disable starboard")),
    category: "Config",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const prisma = interaction.client.prisma;
        
        if (sub === "set") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            const ch = interaction.options.getChannel("channel");
            const thr = interaction.options.getInteger("threshold") ?? 3;
            const emoji = interaction.options.getString("emoji") ?? "⭐";
            
            await prisma.starboardConfig.upsert({
                where: { guildId: interaction.guildId },
                update: { channelId: ch.id, threshold: thr, emoji },
                create: { guildId: interaction.guildId, channelId: ch.id, threshold: thr, emoji }
            });
            
            return containerReply(interaction, successPanel("Starboard Configured", `Channel: <#${ch.id}>\nThreshold: ${thr}\nEmoji: ${emoji}`), true);
        }
        
        if (sub === "view") {
            const cfg = await prisma.starboardConfig.findUnique({ where: { guildId: interaction.guildId } });
            if (!cfg) {
                return containerReply(interaction, infoPanel("Starboard", "Not configured"), true);
            }
            return containerReply(interaction, infoPanel("Starboard Configuration", 
                `Channel: <#${cfg.channelId}>\nThreshold: ${cfg.threshold}\nEmoji: ${cfg.emoji}`), true);
        }
        
        if (sub === "disable") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            await prisma.starboardConfig.delete({ where: { guildId: interaction.guildId } }).catch(() => {});
            return containerReply(interaction, successPanel("Starboard Disabled", "Starboard has been disabled for this server."), true);
        }
    }
};
