import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { success, error, panel, stat } from "../../design/embeds.js";

export default {
    category: "moderation",
    data: new SlashCommandBuilder()
        .setName("appeals")
        .setDescription("Manage ban appeals")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addSubcommand(sub => sub
            .setName("list")
            .setDescription("List pending appeals"))
        .addSubcommand(sub => sub
            .setName("approve")
            .setDescription("Approve an appeal and unban the user")
            .addStringOption(o => o.setName("id").setDescription("Appeal ID").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("deny")
            .setDescription("Deny an appeal")
            .addStringOption(o => o.setName("id").setDescription("Appeal ID").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("stats")
            .setDescription("Appeal statistics")),

    async execute(interaction) {
        const { appeals } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "list") {
            const pending = await appeals.listPending(interaction.guild.id);
            if (!pending.length) {
                return interaction.reply({ embeds: [panel("Appeals", "No pending appeals.")], flags: MessageFlags.Ephemeral });
            }

            const lines = pending.map(a =>
                `**#${a.caseNumber}** — <@${a.appellantId}>\nReason: ${a.reason}\nID: \`${a.id}\``
            );

            return interaction.reply({ embeds: [panel("Pending Appeals", lines.join("\n\n"))], flags: MessageFlags.Ephemeral });
        }

        if (sub === "approve") {
            const id = interaction.options.getString("id");
            const reviewerTag = interaction.user.tag;
            const result = await appeals.approve(id, interaction.user.id, reviewerTag);
            if (!result) {
                return interaction.reply({ embeds: [error("Not Found", "Appeal not found.")], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ embeds: [success("Approved", `Appeal approved. User <@${result.appellantId}> has been unbanned.`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "deny") {
            const id = interaction.options.getString("id");
            const reviewerTag = interaction.user.tag;
            const result = await appeals.deny(id, interaction.user.id, reviewerTag);
            if (!result) {
                return interaction.reply({ embeds: [error("Not Found", "Appeal not found.")], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ embeds: [success("Denied", `Appeal for case #${result.caseNumber} denied.`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "stats") {
            const stats = await appeals.getStats(interaction.guild.id);
            return interaction.reply({
                embeds: [panel("Appeal Stats", [
                    stat("Pending", stats.pending),
                    stat("Approved", stats.approved),
                    stat("Denied", stats.denied),
                    stat("Total", stats.total),
                ].map(f => `${f.name}: **${f.value}**`).join("\n"))],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
