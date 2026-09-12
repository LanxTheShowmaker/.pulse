import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { success } from "../../ui/embeds.js";

function parseDuration(input) {
    if (!input) return null;
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    return { ms: n * ms, text: `${n}${unit}` };
}

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("remind")
        .setDescription("Set a reminder")
        .addStringOption(o => o.setName("time").setDescription("When to remind (e.g. 2h, 30m, 1d)").setRequired(true))
        .addStringOption(o => o.setName("message").setDescription("What to remind you about").setRequired(true)),
    async execute(interaction) {
        const timeStr = interaction.options.getString("time");
        const message = interaction.options.getString("message");
        const duration = parseDuration(timeStr);
        if (!duration) return interaction.reply({ content: "Invalid duration. Use `2h`, `30m`, `1d`, etc.", flags: MessageFlags.Ephemeral });

        const remindAt = new Date(Date.now() + duration.ms);

        await interaction.client.services.prisma.reminder.create({
            data: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                userId: interaction.user.id,
                message,
                remindAt,
            },
        });

        await interaction.reply({
            embeds: [success("Reminder Set", `I'll remind you **${duration.text}** from now.\n**Message:** ${message}`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
