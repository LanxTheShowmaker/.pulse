import { ComponentType, MessageFlags } from "discord.js";
import { errorPanel, successPanel } from "../../design/containers/panels.js";
import { moderationActionPanel } from "../../design/containers/moderation.js";
import { isModerator } from "../../core/services.js";

export async function defer(interaction, ephemeral = false) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    }
}

export async function requireModerator(interaction) {
    const client = interaction.client;
    const member = interaction.member;
    const config = await client.services.settings.get(interaction.guildId).catch(() => null);
    
    if (!isModerator(member, config)) {
        await interaction.reply({ components: [errorPanel("Missing permission", "You need moderator permissions or a moderator role to use this.")], flags: MessageFlags.Ephemeral });
        return false;
    }
    return true;
}

export async function requireStaff(interaction) {
    const client = interaction.client;
    const member = interaction.member;
    const config = await client.services.settings.get(interaction.guildId).catch(() => null);
    
    if (!isStaff(member, config)) {
        await interaction.reply({ components: [errorPanel("Missing permission", "You need staff permissions to use this.")], flags: MessageFlags.Ephemeral });
        return false;
    }
    return true;
}

export function isStaff(member, config) {
    if (member.permissions.has("Administrator") || member.permissions.has("ManageGuild"))
        return true;
    const roleIds = new Set(member.roles.cache.keys());
    if (!config)
        return false;
    if (config.staffRoleIds.some((id) => roleIds.has(id)))
        return true;
    if (config.moderatorRoleIds.some((id) => roleIds.has(id)))
        return true;
    return false;
}

export function canModerate(invokerMember, targetMember) {
    try {
        if (!invokerMember || !targetMember) return false;
        if (invokerMember.id === targetMember.id) return false;
        if (targetMember.id === targetMember.guild?.ownerId) return false;
        const invokerTop = invokerMember.roles?.highest?.position;
        const targetTop = targetMember.roles?.highest?.position;
        if (typeof invokerTop !== "number" || typeof targetTop !== "number") return false;
        if (invokerTop <= targetTop) return false;
        if (!targetMember.moderatable) return false;
        return true;
    } catch {
        return false;
    }
}

export async function confirmAction(interaction, panel) {
    const acceptId = `confirm:${interaction.id}:yes`;
    const cancelId = `confirm:${interaction.id}:no`;
    
    const { createContainer, createActionRow, createButton, ButtonStyle } = await import("../../design/containers/base.js");
    
    const confirmPanel = panel;
    // Add buttons to the panel
    const lastComponent = confirmPanel.components[confirmPanel.components.length - 1];
    if (lastComponent?.type === 17) { // Separator
        confirmPanel.components.splice(confirmPanel.components.length - 2, 2);
    }
    
    confirmPanel.components.push(
        createActionRow(
            createButton(acceptId, "Confirm", ButtonStyle.Danger),
            createButton(cancelId, "Cancel", ButtonStyle.Secondary)
        )
    );
    
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ components: [confirmPanel] });
    } else {
        await interaction.reply({ components: [confirmPanel], flags: MessageFlags.Ephemeral });
    }
    
    const response = await interaction.fetchReply();
    return new Promise((resolve) => {
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000, max: 1 });
        collector.on("collect", async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: "Not your confirmation.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            if (i.customId === acceptId) {
                await i.update({ components: [] }).catch(() => {});
                resolve(true);
            } else {
                await i.update({ components: [errorPanel("Cancelled", "Action was not performed.")] }).catch(() => {});
                resolve(false);
            }
        });
        collector.on("end", (collected) => {
            if (collected.size === 0) {
                try {
                    const row = confirmPanel.components[confirmPanel.components.length - 1];
                    for (const btn of row?.components ?? []) {
                        if (typeof btn?.setDisabled === "function") btn.setDisabled(true);
                    }
                    response.edit({ components: [confirmPanel] }).catch(() => {});
                } catch {}
                resolve(false);
            }
        });
    });
}

export async function sendActionResult(interaction, action, target, moderator, reason, caseNumber, duration = null) {
    const panel = moderationActionPanel(action, target, moderator, reason, caseNumber, duration);
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ components: [panel] });
    } else {
        await interaction.reply({ components: [panel] });
    }
}

export function parseDuration(input) {
    const match = input.trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return value * mult[unit];
}

export function formatDuration(ms) {
    if (!ms) return "unknown";
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}