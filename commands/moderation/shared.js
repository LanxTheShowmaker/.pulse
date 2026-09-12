import { MessageFlags, ButtonStyle } from "discord.js";
import { row, button } from "../../ui/components.js";

export function parseDuration(input) {
    if (!input) return null;
    const match = input.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    const text = `${n}${unit}`;
    return { ms: n * ms, text };
}

export function formatDuration(ms) {
    if (!ms) return "N/A";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
}

export async function requireModerator(interaction) {
    const config = await interaction.client.services.prisma.guildConfig.findUnique({
        where: { guildId: interaction.guild.id },
    });
    if (interaction.member.permissions.has("Administrator") || interaction.member.permissions.has("ManageGuild")) return true;
    if (!config) return false;
    const roleIds = new Set(interaction.member.roles.cache.keys());
    const staffIds = JSON.parse(config.staffRoleIds || "[]");
    if (staffIds.some(id => roleIds.has(id))) return true;
    const modIds = JSON.parse(config.moderatorRoleIds || "[]");
    if (modIds.some(id => roleIds.has(id))) return true;
    return false;
}

export async function canModerate(executor, target, guild) {
    if (target.id === executor.id) return "You cannot moderate yourself.";
    if (target.bot) return "You cannot moderate bots.";
    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!executorMember) return "Could not resolve your member.";
    if (!targetMember) return "User not in server.";
    if (targetMember.roles.highest.position >= executorMember.roles.highest.position && !executorMember.permissions.has("Administrator")) {
        return "Cannot moderate someone with equal or higher role.";
    }
    return true;
}

export async function ephemeral(interaction, content) {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

export async function confirmAction(interaction, question) {
    await interaction.reply({
        content: question,
        components: [row(
            button("Confirm", `confirm:${interaction.id}`, ButtonStyle.Danger),
            button("Cancel", `cancel:${interaction.id}`, ButtonStyle.Secondary),
        )],
        flags: MessageFlags.Ephemeral,
    });

    const collected = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id && (i.customId === `confirm:${interaction.id}` || i.customId === `cancel:${interaction.id}`),
        time: 15_000,
    }).catch(() => null);

    if (!collected || collected.customId === `cancel:${interaction.id}`) {
        if (collected) await collected.update({ content: "Cancelled.", components: [] }).catch(() => {});
        return false;
    }

    await collected.update({ content: "Processing...", components: [] }).catch(() => {});
    return true;
}
