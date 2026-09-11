import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

const STYLES = [
    { name: "Short Time", value: "t", example: "" },
    { name: "Long Time", value: "T", example: "" },
    { name: "Short Date", value: "d", example: "" },
    { name: "Long Date", value: "D", example: "" },
    { name: "Long Date/Time", value: "f", example: "" },
    { name: "Relative", value: "R", example: "" },
];

function formatDiscordTimestamp(date, style) {
    const epoch = Math.floor(date.getTime() / 1000);
    return `<t:${epoch}:${style}>`;
}

function parseInput(input) {
    if (!input) return null;

    const now = new Date();

    const offsetMatch = input.match(/^([+-]?\d+)(s|m|h|d|w)$/);
    if (offsetMatch) {
        const amount = parseInt(offsetMatch[1], 10);
        const unit = offsetMatch[2];
        const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
        return new Date(now.getTime() + amount * multipliers[unit]);
    }

    const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dateMatch) {
        const [, year, month, day, hour = "0", minute = "0", second = "0"] = dateMatch;
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second)));
    }

    const epochMatch = input.match(/^(\d{10,13})$/);
    if (epochMatch) {
        const num = parseInt(epochMatch[1], 10);
        return num > 1e12 ? new Date(num) : new Date(num * 1000);
    }

    return null;
}

export default {
    data: new SlashCommandBuilder()
        .setName("timestamp")
        .setDescription("Generate Discord timestamp codes")
        .addStringOption(o => o.setName("time").setDescription("Time: +30m, +2h, 2025-01-15, 1700000000, or empty for now").setRequired(false)),
    category: "Utility",
    async execute(interaction) {
        const input = interaction.options.getString("time");
        const date = parseInput(input);

        if (!date || isNaN(date.getTime())) {
            return interaction.reply({
                embeds: [embeds.error("Invalid time", "Examples: `+30m`, `+2h`, `+1d`, `2025-01-15`, `2025-01-15 14:30`, `1700000000`")],
                flags: MessageFlags.Ephemeral,
            });
        }

        const epoch = Math.floor(date.getTime() / 1000);
        const iso = date.toISOString();
        const display = date.toLocaleString("en-US", { dateStyle: "full", timeStyle: "long", timeZone: "UTC" });

        const fields = STYLES.map(s => ({
            name: s.name,
            value: `\`<t:${epoch}:${s.value}>\`\n${formatDiscordTimestamp(date, s.value)}`,
            inline: true,
        }));

        const embed = new EmbedBuilder()
            .setColor(Theme.info)
            .setAuthor({ name: "Timestamp Generator", iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
            .setTitle(display)
            .setDescription(`ISO: \`${iso}\`\nEpoch: \`${epoch}\`\n\nCopy any format below:`)
            .addFields(fields)
            .setFooter({ text: "Discord timestamps render in each user's local timezone" })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
