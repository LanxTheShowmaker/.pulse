import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { defer } from "../../commands/moderation/shared.js";
import { containerReply, containerEdit } from "../../design/containers/base.js";
import { errorPanel, successPanel } from "../../design/containers/panels.js";
import { isStaff } from "../../core/services.js";
import { logger } from "../../core/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("slowmode")
        .setDescription("Set the channel slowmode")
        .addIntegerOption((o) => o.setName("seconds").setDescription("Slowmode in seconds (0 to disable)").setRequired(true).setMinValue(0).setMaxValue(21600)),
    category: "Utility",
    async execute(interaction) {
        await defer(interaction, true);
        const client = interaction.client;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const member = interaction.member;
        const seconds = interaction.options.getInteger("seconds", true);
        const config = await client.services.settings.get(guild.id).catch(() => null);
        const hasChannelPerm = member.permissions.has("ManageChannels");
        if (!isStaff(member, config) && !hasChannelPerm) {
            return containerEdit(interaction, errorPanel("Missing permission", "You need staff role or Manage Channels permission."));
        }
        try {
            await channel.setRateLimitPerUser(seconds);
            await containerEdit(interaction, successPanel("Slowmode updated", seconds === 0 ? "Slowmode disabled." : `Slowmode set to **${seconds}** second(s).`));
        }
        catch (e) {
            logger.error("utility", "slowmode failed", e);
            await containerEdit(interaction, errorPanel("Slowmode failed", "Could not update the channel slowmode."));
        }
    },
};
//# sourceMappingURL=slowmode.js.map