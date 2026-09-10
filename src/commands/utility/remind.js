import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { defer, parseDuration } from "../../commands/moderation/shared.js";
import { containerReply, containerEdit } from "../../design/containers/base.js";
import { errorPanel, successPanel } from "../../design/containers/panels.js";
import { time } from "discord.js";
import { logger } from "../../core/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("remind")
        .setDescription("Set a reminder")
        .addStringOption((o) => o.setName("when").setDescription("Duration, e.g. 10m, 1h, 2d").setRequired(true))
        .addStringOption((o) => o.setName("text").setDescription("What to remind you about").setRequired(true)),
    category: "Utility",
    async execute(interaction) {
        await defer(interaction, true);
        const client = interaction.client;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const when = interaction.options.getString("when", true);
        const text = interaction.options.getString("text", true);
        const ms = parseDuration(when);
        if (ms === null) {
            return containerEdit(interaction, errorPanel("Invalid duration", "Use a format like 10m, 1h, or 2d."));
        }
        const remindAt = new Date(Date.now() + Number(ms));
        try {
            await client.services.utility.createReminder({
                guildId: guild.id,
                channelId: channel.id,
                userId: interaction.user.id,
                message: text.slice(0, 1000),
                remindAt,
            });
            await containerEdit(interaction, successPanel("Reminder set", `I will remind you ${time(remindAt, "R")}.`));
        }
        catch (e) {
            logger.error("utility", "remind failed", e);
            await containerEdit(interaction, errorPanel("Reminder failed", "Could not save your reminder."));
        }
    },
};
//# sourceMappingURL=remind.js.map