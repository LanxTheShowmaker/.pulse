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
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName("start").setDescription("Start a giveaway")
            .addChannelOption(o => o.setName("channel").setDescription("Channel to post in").setRequired(true))
            .addStringOption(o => o.setName("prize").setDescription("Prize to give away").setRequired(true))
            .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20).setRequired(true))
            .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 30m, 2h, 1d)").setRequired(true))
        )
        .addSubcommand(s => s.setName("end").setDescription("End a giveaway early")
            .addStringOption(o => o.setName("message-id").setDescription("Giveaway message ID").setRequired(true))
        )
        .addSubcommand(s => s.setName("reroll").setDescription("Reroll winner(s)")
            .addStringOption(o => o.setName("message-id").setDescription("Giveaway message ID").setRequired(true))
            .addIntegerOption(o => o.setName("count").setDescription("Number of winners to reroll").setMinValue(1).setMaxValue(20).setRequired(false))
        )
        .addSubcommand(s => s.setName("list").setDescription("List active giveaways")),
    category: "Utility",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const service = interaction.client.services.giveaways;

        if (sub === "start") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No permission", "Manage Server required")], flags: MessageFlags.Ephemeral });
            }
            const channel = interaction.options.getChannel("channel");
            const prize = interaction.options.getString("prize");
            const winners = interaction.options.getInteger("winners");
            const durationStr = interaction.options.getString("duration");
            const duration = parseDuration(durationStr);
            if (!duration || duration < 10_000) {
                return interaction.reply({ embeds: [embeds.error("Invalid duration", "Minimum 10 seconds. Use format like 30m, 2h, 1d")], flags: MessageFlags.Ephemeral });
            }
            if (duration > 365 * 86_400_000) {
                return interaction.reply({ embeds: [embeds.error("Invalid duration", "Maximum 365 days")], flags: MessageFlags.Ephemeral });
            }
            if (channel.type !== 0) {
                return interaction.reply({ embeds: [embeds.error("Invalid channel", "Must be a text channel")], flags: MessageFlags.Ephemeral });
            }
            try {
                const result = await service.create(interaction.guild, channel, prize, winners, duration, interaction.member);
                const endsAt = new Date(Date.now() + duration);
                return interaction.reply({
                    embeds: [embeds.success("Giveaway Created", `Prize: **${prize}**\nWinners: **${winners}**\nChannel: <#${channel.id}>\nEnds: <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)],
                });
            } catch (e) {
                return interaction.reply({ embeds: [embeds.error("Failed", e.message)], flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === "end") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No permission", "Manage Server required")], flags: MessageFlags.Ephemeral });
            }
            const messageId = interaction.options.getString("message-id");
            const giveaway = await service.getByMessage(messageId);
            if (!giveaway) {
                return interaction.reply({ embeds: [embeds.error("Not found", "Giveaway not found. Check the message ID.")], flags: MessageFlags.Ephemeral });
            }
            if (giveaway.guildId !== interaction.guild.id) {
                return interaction.reply({ embeds: [embeds.error("Wrong server", "This giveaway belongs to another server.")], flags: MessageFlags.Ephemeral });
            }
            if (giveaway.status === "ENDED") {
                return interaction.reply({ embeds: [embeds.warn("Already ended", "This giveaway has already ended.")], flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply().catch(() => {});
            const result = await service.end(giveaway.id, interaction.user.id);
            if (result.ok) {
                return interaction.editReply({
                    embeds: [embeds.success("Giveaway Ended", `**${giveaway.prize}**\nWinners: ${result.winnerIds.length ? result.winnerIds.map(id => `<@${id}>`).join(", ") : "None"}\nEntries: ${result.entryCount}`)],
                });
            } else {
                return interaction.editReply({ embeds: [embeds.error("Failed", result.error)] });
            }
        }

        if (sub === "reroll") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No permission", "Manage Server required")], flags: MessageFlags.Ephemeral });
            }
            const messageId = interaction.options.getString("message-id");
            const count = interaction.options.getInteger("count") || 1;
            const giveaway = await service.getByMessage(messageId);
            if (!giveaway) {
                return interaction.reply({ embeds: [embeds.error("Not found", "Giveaway not found. Check the message ID.")], flags: MessageFlags.Ephemeral });
            }
            if (giveaway.guildId !== interaction.guild.id) {
                return interaction.reply({ embeds: [embeds.error("Wrong server", "This giveaway belongs to another server.")], flags: MessageFlags.Ephemeral });
            }
            if (giveaway.status !== "ENDED") {
                return interaction.reply({ embeds: [embeds.warn("Not ended", "Reroll only works on ended giveaways.")], flags: MessageFlags.Ephemeral });
            }
            const result = await service.reroll(giveaway.id, count);
            if (result.ok) {
                return interaction.reply({
                    embeds: [embeds.success("Rerolled", `New winner${result.winnerIds.length === 1 ? "" : "s"}: ${result.winnerIds.map(id => `<@${id}>`).join(", ")}`)],
                });
            } else {
                return interaction.reply({ embeds: [embeds.error("Failed", result.error)], flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === "list") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No permission", "Manage Server required")], flags: MessageFlags.Ephemeral });
            }
            const giveaways = await service.list(interaction.guild.id, "ACTIVE");
            if (giveaways.length === 0) {
                return interaction.reply({ embeds: [embeds.info("No Giveaways", "No active giveaways in this server.")], flags: MessageFlags.Ephemeral });
            }
            const lines = giveaways.map(g => {
                const entries = g.entryCount ?? 0;
                const ends = Math.floor(new Date(g.endsAt).getTime() / 1000);
                return `**${g.prize}** — ${g.winners} winner${g.winners === 1 ? "" : "s"} — ${entries} entries — ends <t:${ends}:R>\n-# <#${g.channelId}> • ID: \`${g.id.slice(0, 8)}\``;
            });
            return interaction.reply({
                embeds: [embeds.info("Active Giveaways", lines.join("\n\n"))],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
