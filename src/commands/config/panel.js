import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { success, error, panel, stat } from "../../design/embeds.js";

export default {
    category: "config",
    data: new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Manage persistent panels")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("create")
            .setDescription("Create a persistent panel")
            .addStringOption(o => o.setName("type").setDescription("Panel type").setRequired(true)
                .addChoices(
                    { name: "Welcome", value: "welcome" },
                    { name: "Rules", value: "rules" },
                    { name: "Info", value: "info" },
                    { name: "Ticket", value: "ticket" },
                    { name: "Custom", value: "custom" },
                ))
            .addChannelOption(o => o.setName("channel").setDescription("Channel to send in").setRequired(true))
            .addStringOption(o => o.setName("title").setDescription("Panel title").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Panel description").setRequired(true))
            .addStringOption(o => o.setName("banner").setDescription("Banner image URL").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("list")
            .setDescription("List all panels"))
        .addSubcommand(sub => sub
            .setName("disable")
            .setDescription("Disable a panel")
            .addStringOption(o => o.setName("type").setDescription("Panel type").setRequired(true)
                .addChoices(
                    { name: "Welcome", value: "welcome" },
                    { name: "Rules", value: "rules" },
                    { name: "Info", value: "info" },
                    { name: "Ticket", value: "ticket" },
                    { name: "Custom", value: "custom" },
                )))
        .addSubcommand(sub => sub
            .setName("refresh")
            .setDescription("Refresh a panel's embed")
            .addStringOption(o => o.setName("type").setDescription("Panel type").setRequired(true)
                .addChoices(
                    { name: "Welcome", value: "welcome" },
                    { name: "Rules", value: "rules" },
                    { name: "Info", value: "info" },
                    { name: "Ticket", value: "ticket" },
                    { name: "Custom", value: "custom" },
                ))),

    async execute(interaction) {
        const { panelService } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "create") {
            const type = interaction.options.getString("type");
            const channel = interaction.options.getChannel("channel");
            const title = interaction.options.getString("title");
            const description = interaction.options.getString("description");
            const banner = interaction.options.getString("banner");

            const result = await panelService.create(interaction.guild.id, type, channel.id, {
                title, description, bannerUrl: banner,
            });

            if (!result) {
                return interaction.reply({ embeds: [error("Failed", "Could not create panel. Check channel permissions.")], flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({ embeds: [success("Panel Created", `Persistent **${type}** panel created in <#${channel.id}>`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "list") {
            const panels = await panelService.list(interaction.guild.id);
            if (!panels.length) {
                return interaction.reply({ embeds: [panel("Panels", "No panels configured.")], flags: MessageFlags.Ephemeral });
            }

            const lines = panels.map(p =>
                `**${p.panelType}** — ${p.enabled ? "Enabled" : "Disabled"} — ${p.channelId ? `<#${p.channelId}>` : "No channel"}`
            );

            return interaction.reply({ embeds: [panel("Panels", lines.join("\n"))], flags: MessageFlags.Ephemeral });
        }

        if (sub === "disable") {
            const type = interaction.options.getString("type");
            const result = await panelService.disable(interaction.guild.id, type);
            if (!result) {
                return interaction.reply({ embeds: [error("Not Found", "Panel not found.")], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ embeds: [success("Disabled", `**${type}** panel disabled.`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "refresh") {
            const type = interaction.options.getString("type");
            const result = await panelService.update(interaction.guild.id, type);
            if (!result) {
                return interaction.reply({ embeds: [error("Not Found", "Panel not found or channel unavailable.")], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ embeds: [success("Refreshed", `**${type}** panel refreshed.`)], flags: MessageFlags.Ephemeral });
        }
    },
};
