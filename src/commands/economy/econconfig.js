import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { success, panel, stat } from "../../design/embeds.js";

export default {
    category: "economy",
    data: new SlashCommandBuilder()
        .setName("econconfig")
        .setDescription("Configure economy settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("view")
            .setDescription("View current economy config"))
        .addSubcommand(sub => sub
            .setName("daily")
            .setDescription("Set daily reward amount")
            .addIntegerOption(o => o.setName("amount").setDescription("Base daily amount").setRequired(true).setMinValue(1).setMaxValue(100000)))
        .addSubcommand(sub => sub
            .setName("weekly")
            .setDescription("Set weekly reward amount")
            .addIntegerOption(o => o.setName("amount").setDescription("Base weekly amount").setRequired(true).setMinValue(1).setMaxValue(1000000)))
        .addSubcommand(sub => sub
            .setName("jobs")
            .setDescription("Toggle work/jobs")
            .addBooleanOption(o => o.setName("enabled").setDescription("Enable jobs").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("trading")
            .setDescription("Toggle trading (gift/rob)")
            .addBooleanOption(o => o.setName("enabled").setDescription("Enable trading").setRequired(true))),

    async execute(interaction) {
        const { economy } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "view") {
            const cfg = await economy.getEconomyConfig(interaction.guild.id);
            const embed = panel("Economy Config", "")
                .addFields(
                    stat("Daily Amount", `${cfg.dailyAmount} coins`),
                    stat("Weekly Amount", `${cfg.weeklyAmount} coins`),
                    stat("Jobs", cfg.jobsEnabled ? "Enabled" : "Disabled"),
                    stat("Trading", cfg.tradingEnabled ? "Enabled" : "Disabled"),
                    stat("Shop", cfg.shopEnabled ? "Enabled" : "Disabled"),
                );
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === "daily") {
            const amount = interaction.options.getInteger("amount");
            await economy.setEconomyConfig(interaction.guild.id, { dailyAmount: amount });
            return interaction.reply({ embeds: [success("Updated", `Daily reward set to **${amount}** coins`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "weekly") {
            const amount = interaction.options.getInteger("amount");
            await economy.setEconomyConfig(interaction.guild.id, { weeklyAmount: amount });
            return interaction.reply({ embeds: [success("Updated", `Weekly reward set to **${amount}** coins`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "jobs") {
            const enabled = interaction.options.getBoolean("enabled");
            await economy.setEconomyConfig(interaction.guild.id, { jobsEnabled: enabled });
            return interaction.reply({ embeds: [success("Updated", `Jobs **${enabled ? "enabled" : "disabled"}**`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "trading") {
            const enabled = interaction.options.getBoolean("enabled");
            await economy.setEconomyConfig(interaction.guild.id, { tradingEnabled: enabled });
            return interaction.reply({ embeds: [success("Updated", `Trading **${enabled ? "enabled" : "disabled"}**`)], flags: MessageFlags.Ephemeral });
        }
    },
};
