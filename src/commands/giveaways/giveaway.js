import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { success, error, panel } from "../../design/embeds.js";
import { ephemeral } from "../moderation/shared.js";

function parseDuration(input) {
    if (!input) return null;
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    return new Date(Date.now() + n * ms);
}

export default {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Giveaway management")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName("start")
            .setDescription("Start a giveaway")
            .addChannelOption(o => o.setName("channel").setDescription("Channel to post in").setRequired(true))
            .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
            .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 1h, 7d)").setRequired(true))
            .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("end")
            .setDescription("End a giveaway early")
            .addStringOption(o => o.setName("message-id").setDescription("Giveaway message ID").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("reroll")
            .setDescription("Reroll winner(s)")
            .addStringOption(o => o.setName("message-id").setDescription("Giveaway message ID").setRequired(true))
            .addIntegerOption(o => o.setName("count").setDescription("Number of winners to reroll").setRequired(false))
        )
        .addSubcommand(sub => sub.setName("list").setDescription("List active giveaways")),

    async execute(interaction) {
        const { giveaways } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "start": {
                const channel = interaction.options.getChannel("channel");
                const prize = interaction.options.getString("prize");
                const winners = interaction.options.getInteger("winners") ?? 1;
                const endsAt = parseDuration(interaction.options.getString("duration"));
                if (!endsAt) return ephemeral(interaction, "Invalid duration. Use formats like `1h`, `7d`, `30m`.");

                if (!channel.isTextBased()) return ephemeral(interaction, "Channel must be a text channel.");

                await interaction.deferReply();

                const result = await giveaways.create(interaction.guild, channel, interaction.user, prize, winners, endsAt);
                await interaction.editReply({ embeds: [success("Giveaway Created", `Posted in <#${channel.id}>. Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>.`)] });
                break;
            }

            case "end": {
                const messageId = interaction.options.getString("message-id");
                await interaction.deferReply();

                // Find giveaway by messageId
                const giveaway = await interaction.client.services.prisma.giveaway.findUnique({
                    where: { messageId },
                }).catch(() => null);

                if (!giveaway) return interaction.editReply({ embeds: [error("Not Found", "Giveaway not found with that message ID.")] });

                const result = await giveaways.end(giveaway.id);
                if (!result.ok) return interaction.editReply({ embeds: [error("Failed", result.error)] });

                const mentions = result.winnerIds?.length ? result.winnerIds.map(id => `<@${id}>`).join(", ") : "No entries";
                await interaction.editReply({ embeds: [success("Giveaway Ended", `Winner(s): ${mentions}`)] });
                break;
            }

            case "reroll": {
                const messageId = interaction.options.getString("message-id");
                const count = interaction.options.getInteger("count") ?? 1;
                await interaction.deferReply();

                const giveaway = await interaction.client.services.prisma.giveaway.findUnique({
                    where: { messageId },
                }).catch(() => null);

                if (!giveaway) return interaction.editReply({ embeds: [error("Not Found", "Giveaway not found with that message ID.")] });

                const result = await giveaways.reroll(giveaway.id, count);
                if (!result.ok) return interaction.editReply({ embeds: [error("Failed", result.error)] });

                const mentions = result.winnerIds?.length ? result.winnerIds.map(id => `<@${id}>`).join(", ") : "No entries";
                await interaction.editReply({ embeds: [success("Rerolled", `New winner(s): ${mentions}`)] });
                break;
            }

            case "list": {
                const list = await interaction.client.services.prisma.giveaway.findMany({
                    where: { guildId: interaction.guild.id, status: "ACTIVE" },
                    orderBy: { endsAt: "asc" },
                    take: 10,
                });

                if (!list.length) return ephemeral(interaction, "No active giveaways.");

                const lines = list.map(g => `\`${g.id.slice(0, 8)}\` **${g.prize}** — ${g.entryCount} entries — <t:${Math.floor(new Date(g.endsAt).getTime() / 1000)}:R>`);
                await interaction.reply({ embeds: [panel("Active Giveaways", lines.join("\n"))] });
                break;
            }
        }
    },
};
