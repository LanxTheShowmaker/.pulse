import { SlashCommandBuilder } from "@discordjs/builders";
import { defer } from "../../commands/moderation/shared.js";
import { containerReply, containerEdit } from "../../design/containers/base.js";
import { errorPanel, successPanel } from "../../design/containers/panels.js";
import { logger } from "../../core/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create a poll with up to 10 options")
        .addStringOption((o) => o.setName("question").setDescription("The poll question").setRequired(true))
        .addStringOption((o) => o.setName("option1").setDescription("Option 1").setRequired(true))
        .addStringOption((o) => o.setName("option2").setDescription("Option 2").setRequired(true))
        .addStringOption((o) => o.setName("option3").setDescription("Option 3").setRequired(false))
        .addStringOption((o) => o.setName("option4").setDescription("Option 4").setRequired(false))
        .addStringOption((o) => o.setName("option5").setDescription("Option 5").setRequired(false))
        .addStringOption((o) => o.setName("option6").setDescription("Option 6").setRequired(false))
        .addStringOption((o) => o.setName("option7").setDescription("Option 7").setRequired(false))
        .addStringOption((o) => o.setName("option8").setDescription("Option 8").setRequired(false))
        .addStringOption((o) => o.setName("option9").setDescription("Option 9").setRequired(false))
        .addStringOption((o) => o.setName("option10").setDescription("Option 10").setRequired(false)),
    category: "Utility",
    async execute(interaction) {
        await defer(interaction, false);
        const client = interaction.client;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const question = interaction.options.getString("question", true);
        const options = [];
        for (let i = 1; i <= 10; i++) {
            const v = interaction.options.getString(`option${i}`);
            if (v && v.trim())
                options.push({ label: v.trim().slice(0, 80), votes: 0 });
        }
        if (options.length < 2) {
            return containerEdit(interaction, errorPanel("Not enough options", "Provide at least 2 options."));
        }
        try {
            const utility = client.services.utility;
            const msg = await channel.send({ 
                embeds: [utility.buildPollEmbed(question, options)] 
            });
            const rows = utility.buildPollButtons(msg.id, options);
            await msg.edit({ components: rows });
            await utility.createPoll({
                guildId: guild.id,
                channelId: channel.id,
                messageId: msg.id,
                authorId: interaction.user.id,
                question,
                options,
            });
            await containerEdit(interaction, successPanel("Poll created", "Your poll is live in this channel."));
        }
        catch (e) {
            logger.error("utility", "poll failed", e);
            await containerEdit(interaction, errorPanel("Poll failed", "Could not create the poll."));
        }
    },
};
//# sourceMappingURL=poll.js.map