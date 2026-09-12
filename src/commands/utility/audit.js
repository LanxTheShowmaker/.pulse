import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";
import { requireModerator, ephemeral } from "../moderation/shared.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("audit")
        .setDescription("Audit log viewer")
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .addSubcommand(sub => sub
            .setName("timeline")
            .setDescription("Recent audit events")
            .addIntegerOption(o => o.setName("count").setDescription("Number of entries (max 25)").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("user")
            .setDescription("Audit events for a user")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("stats").setDescription("Audit statistics")),

    async execute(interaction) {
        const { audit } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "timeline": {
                const count = Math.min(interaction.options.getInteger("count") ?? 15, 25);
                const entries = await audit.timeline(interaction.guild.id, count);
                if (!entries.length) return interaction.reply({ embeds: [panel("Audit Log", "No entries found.")], flags: MessageFlags.Ephemeral });

                const lines = entries.map(e => `\`${e.action}\` by <@${e.actorId ?? "system"}> → <@${e.targetId ?? "?"}> — ${e.category} — <t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`);
                await interaction.reply({ embeds: [panel("Audit Timeline", lines.join("\n"))], flags: MessageFlags.Ephemeral });
                break;
            }

            case "user": {
                const target = interaction.options.getUser("target");
                const entries = await audit.byUser(interaction.guild.id, target.id, 15);
                if (!entries.length) return interaction.reply({ embeds: [panel("User Audit", `No entries for ${target.tag}.`)], flags: MessageFlags.Ephemeral });

                const lines = entries.map(e => `\`${e.action}\` → <@${e.targetId ?? "?"}> — ${e.category} — <t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`);
                await interaction.reply({ embeds: [panel(`${target.tag} — Audit`, lines.join("\n"))], flags: MessageFlags.Ephemeral });
                break;
            }

            case "stats": {
                const stats = await audit.stats(interaction.guild.id);
                const lines = Object.entries(stats.byCategory).map(([cat, count]) => `**${cat}**: ${count}`);
                await interaction.reply({
                    embeds: [panel("Audit Stats", `Total: **${stats.total}**\n${lines.join("\n") || "No data."}`)],
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }
        }
    },
};
