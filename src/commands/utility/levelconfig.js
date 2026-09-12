import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { success, error, panel, stat } from "../../design/embeds.js";

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("levelconfig")
        .setDescription("Configure leveling settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("view")
            .setDescription("View current leveling config"))
        .addSubcommand(sub => sub
            .setName("multiplier")
            .setDescription("Set XP multiplier")
            .addNumberOption(o => o.setName("multiplier").setDescription("XP multiplier (0.5 = half, 2 = double)").setRequired(true).setMinValue(0.1).setMaxValue(10)))
        .addSubcommand(sub => sub
            .setName("channel")
            .setDescription("Set level-up announce channel")
            .addChannelOption(o => o.setName("channel").setDescription("Channel for level-up messages").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("antifarm")
            .setDescription("Toggle anti-farm")
            .addBooleanOption(o => o.setName("enabled").setDescription("Enable anti-farm").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("roleadd")
            .setDescription("Add a level role reward")
            .addIntegerOption(o => o.setName("level").setDescription("Level to award at").setRequired(true).setMinValue(1))
            .addRoleOption(o => o.setName("role").setDescription("Role to award").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("roleremove")
            .setDescription("Remove a level role reward")
            .addIntegerOption(o => o.setName("level").setDescription("Level of reward to remove").setRequired(true))),

    async execute(interaction) {
        const { leveling } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "view") {
            const cfg = await leveling.getLevelConfig(interaction.guild.id);
            const channelMults = Object.entries(cfg.channelMultipliers).map(([ch, mult]) => `<#${ch}>: **${mult}x**`).join("\n") || "None";
            const roleRewards = cfg.roleRewards.sort((a, b) => a.level - b.level).map(r => `Level **${r.level}** → <@&${r.roleId}>`).join("\n") || "None";

            const embed = panel("Level Config", "")
                .addFields(
                    stat("XP Multiplier", `${cfg.xpMultiplier}x`),
                    stat("Anti-Farm", cfg.antiFarmEnabled ? "Enabled" : "Disabled"),
                    stat("Announce Channel", cfg.announceChannelId ? `<#${cfg.announceChannelId}>` : "Default (welcome)"),
                    { name: "Channel Multipliers", value: channelMults, inline: false },
                    { name: "Role Rewards", value: roleRewards, inline: false },
                );

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === "multiplier") {
            const mult = interaction.options.getNumber("multiplier");
            await leveling.setLevelConfig(interaction.guild.id, { xpMultiplier: mult });
            return interaction.reply({ embeds: [success("Updated", `XP multiplier set to **${mult}x**`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "channel") {
            const channel = interaction.options.getChannel("channel");
            await leveling.setLevelConfig(interaction.guild.id, { announceChannelId: channel?.id ?? null });
            return interaction.reply({ embeds: [success("Updated", channel ? `Level-up messages will go to <#${channel.id}>` : "Level-up messages will use the welcome channel")], flags: MessageFlags.Ephemeral });
        }

        if (sub === "antifarm") {
            const enabled = interaction.options.getBoolean("enabled");
            await leveling.setLevelConfig(interaction.guild.id, { antiFarmEnabled: enabled });
            return interaction.reply({ embeds: [success("Updated", `Anti-farm **${enabled ? "enabled" : "disabled"}**`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "roleadd") {
            const level = interaction.options.getInteger("level");
            const role = interaction.options.getRole("role");
            const cfg = await leveling.getLevelConfig(interaction.guild.id);
            const rewards = cfg.roleRewards.filter(r => r.level !== level);
            rewards.push({ level, roleId: role.id });
            await leveling.setLevelConfig(interaction.guild.id, { roleRewards: JSON.stringify(rewards) });
            return interaction.reply({ embeds: [success("Role Reward Added", `Level **${level}** → <@&${role.id}>`)], flags: MessageFlags.Ephemeral });
        }

        if (sub === "roleremove") {
            const level = interaction.options.getInteger("level");
            const cfg = await leveling.getLevelConfig(interaction.guild.id);
            const rewards = cfg.roleRewards.filter(r => r.level !== level);
            await leveling.setLevelConfig(interaction.guild.id, { roleRewards: JSON.stringify(rewards) });
            return interaction.reply({ embeds: [success("Role Reward Removed", `Removed reward for level **${level}**`)], flags: MessageFlags.Ephemeral });
        }
    },
};
