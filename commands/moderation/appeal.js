import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { success, error, panel, stat } from "../../ui/embeds.js";

export default {
    category: "moderation",
    data: new SlashCommandBuilder()
        .setName("appeal")
        .setDescription("Submit a ban appeal")
        .addIntegerOption(o => o.setName("case-number").setDescription("The case number of your ban").setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName("reason").setDescription("Why should you be unbanned?").setRequired(true).setMaxLength(1000)),

    async execute(interaction) {
        const { appeals, moderation } = interaction.client.services;
        const caseNumber = interaction.options.getInteger("case-number");
        const reason = interaction.options.getString("reason");

        // Verify the case exists and is a ban targeting this user
        const case_ = await interaction.client.prisma.case.findFirst({
            where: { guildId: interaction.guild.id, caseNumber, targetId: interaction.user.id, action: "ban" },
        });

        if (!case_) {
            return interaction.reply({ embeds: [error("Not Found", "No ban case found for you with that number.")], flags: MessageFlags.Ephemeral });
        }

        const result = await appeals.submit(interaction.guild.id, caseNumber, interaction.user.id, reason);
        if (!result.ok) {
            return interaction.reply({ embeds: [error("Denied", result.error)], flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ embeds: [success("Appeal Submitted", `Your appeal for case #${caseNumber} has been submitted. Staff will review it shortly.`)], flags: MessageFlags.Ephemeral });
    },
};
