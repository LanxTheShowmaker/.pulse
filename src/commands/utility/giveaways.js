import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { embeds } from "../../design/embeds.js";

function parseDuration(input) {
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return n * multipliers[unit];
}

export default {
    data: new SlashCommandBuilder().setName("giveaways").setDescription("Giveaway management")
        .addSubcommand(s => s.setName("create").setDescription("Create giveaway")
            .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true))
            .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
            .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(10).setRequired(true))
            .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 30m, 2h, 1d)").setRequired(true)))
        .addSubcommand(s => s.setName("reroll").setDescription("Reroll a giveaway")
            .addStringOption(o => o.setName("message-id").setDescription("Giveaway message ID").setRequired(true))),
    category: "Utility",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === "create") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No permission", "Manage Server required")], flags: MessageFlags.Ephemeral });
            }
            const channel = interaction.options.getChannel("channel");
            const prize = interaction.options.getString("prize");
            const winners = interaction.options.getInteger("winners");
            const durationStr = interaction.options.getString("duration");
            const duration = parseDuration(durationStr);
            if (!duration || duration < 10000) return interaction.reply({ embeds: [embeds.error("Invalid duration", "Minimum 10 seconds. Use format like 30m, 2h, 1d")], flags: MessageFlags.Ephemeral });
            const endsAt = new Date(Date.now() + duration);
            try {
                await interaction.client.services.giveaways.create(interaction.guild, channel, prize, winners, endsAt);
                return interaction.reply({ embeds: [embeds.success("Giveaway Created", `Prize: **${prize}**\nWinners: **${winners}**\nEnds: <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)] });
            } catch (e) {
                return interaction.reply({ embeds: [embeds.error("Failed", e.message)], flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === "reroll") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No permission", "Manage Server required")], flags: MessageFlags.Ephemeral });
            }
            const messageId = interaction.options.getString("message-id");
            const channel = interaction.channel;
            try {
                const msg = await channel.messages.fetch(messageId);
                if (!msg) return interaction.reply({ embeds: [embeds.error("Not found", "Message not found in this channel")], flags: MessageFlags.Ephemeral });
                const reaction = msg.reactions.cache.get("\ud83c\udf89");
                if (!reaction) return interaction.reply({ embeds: [embeds.error("No reactions", "No reaction found on that message")], flags: MessageFlags.Ephemeral });
                const users = await reaction.users.fetch();
                const entries = users.filter(u => !u.bot);
                if (entries.size === 0) return interaction.reply({ embeds: [embeds.error("No entries", "No valid entries to reroll")], flags: MessageFlags.Ephemeral });
                const winner = entries.random();
                return interaction.reply({ embeds: [embeds.success("Reroll", `New winner: <@${winner.id}>`)] });
            } catch {
                return interaction.reply({ embeds: [embeds.error("Failed", "Could not fetch message. Ensure the message ID is from this channel.")], flags: MessageFlags.Ephemeral });
            }
        }
    }
};
