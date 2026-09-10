import { createContainer, createSection, createTextDisplay, createActionRow, createButton, ButtonStyle, divider, headerText, bodyText, mutedText, spacer, createThumbnail } from "./base.js";
import { Theme, Brand } from "../../design/theme.js";

export function moderationActionPanel(action, target, moderator, reason, caseNumber, duration = null) {
    const actionLabels = {
        BAN: "Banned",
        KICK: "Kicked",
        TIMEOUT: "Timed Out",
        WARN: "Warned",
        UNBAN: "Unbanned",
        UNTIMEOUT: "Timeout Removed",
        MUTE: "Muted",
        UNMUTE: "Unmuted",
    };
    
    const actionColors = {
        BAN: "danger",
        KICK: "warn",
        TIMEOUT: "warn",
        WARN: "info",
        UNBAN: "success",
        UNTIMEOUT: "success",
        MUTE: "warn",
        UNMUTE: "success",
    };
    
    const label = actionLabels[action] || action;
    const color = actionColors[action] || "info";
    
    const components = [
        headerText(`${Brand.mark} ${label}`),
        divider(),
        bodyText(`**Target:** <@${target.id}> (\`${target.tag}\`)`),
        bodyText(`**Moderator:** <@${moderator.id}> (\`${moderator.tag}\`)`),
        bodyText(`**Case:** #${caseNumber}`),
        bodyText(`**Reason:** ${reason || "No reason provided"}`),
    ];
    
    if (duration) {
        components.push(bodyText(`**Duration:** ${duration}`));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function moderationHistoryPanel(history, target, guild) {
    const components = [
        headerText(`${Brand.mark} Moderation History — ${target.tag}`),
        divider(),
        bodyText(`**User:** <@${target.id}> (\`${target.id}\`)`),
        bodyText(`**Total Cases:** ${history.length}`),
        divider(),
    ];
    
    if (history.length === 0) {
        components.push(bodyText("No moderation history found."));
    } else {
        for (const c of history.slice(0, 10)) {
            const status = c.resolved ? "✓ Resolved" : "Active";
            components.push(bodyText(`**#${c.caseNumber}** · ${c.action} · ${c.reason || "No reason"} · ${status} · <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:R>`));
        }
        
        if (history.length > 10) {
            components.push(mutedText(`Showing 10 of ${history.length} cases`));
        }
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function banConfirmationPanel(target, moderator, reason, deleteDays) {
    const components = [
        headerText(`${Brand.mark} Confirm Ban`),
        divider(),
        bodyText(`**Target:** <@${target.id}> (\`${target.tag}\`)`),
        bodyText(`**Reason:** ${reason || "No reason provided"}`),
        bodyText(`**Delete Messages:** ${deleteDays} day(s)`),
        divider(),
        bodyText("This action **cannot be undone** through the bot. The user will need to be manually unbanned."),
        divider(),
        createActionRow(
            createButton(`mod:ban:confirm:${target.id}`, "Confirm Ban", ButtonStyle.Danger),
            createButton(`mod:ban:cancel:${target.id}`, "Cancel", ButtonStyle.Secondary)
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function timeoutConfirmationPanel(target, moderator, reason, duration) {
    const components = [
        headerText(`${Brand.mark} Confirm Timeout`),
        divider(),
        bodyText(`**Target:** <@${target.id}> (\`${target.tag}\`)`),
        bodyText(`**Reason:** ${reason || "No reason provided"}`),
        bodyText(`**Duration:** ${duration}`),
        divider(),
        createActionRow(
            createButton(`mod:timeout:confirm:${target.id}`, "Confirm Timeout", ButtonStyle.Primary),
            createButton(`mod:timeout:cancel:${target.id}`, "Cancel", ButtonStyle.Secondary)
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function kickConfirmationPanel(target, moderator, reason) {
    const components = [
        headerText(`${Brand.mark} Confirm Kick`),
        divider(),
        bodyText(`**Target:** <@${target.id}> (\`${target.tag}\`)`),
        bodyText(`**Reason:** ${reason || "No reason provided"}`),
        divider(),
        bodyText("The user will be removed from the server but can rejoin with an invite."),
        divider(),
        createActionRow(
            createButton(`mod:kick:confirm:${target.id}`, "Confirm Kick", ButtonStyle.Danger),
            createButton(`mod:kick:cancel:${target.id}`, "Cancel", ButtonStyle.Secondary)
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function warnConfirmationPanel(target, moderator, reason) {
    const components = [
        headerText(`${Brand.mark} Confirm Warning`),
        divider(),
        bodyText(`**Target:** <@${target.id}> (\`${target.tag}\`)`),
        bodyText(`**Reason:** ${reason || "No reason provided"}`),
        divider(),
        createActionRow(
            createButton(`mod:warn:confirm:${target.id}`, "Confirm Warning", ButtonStyle.Primary),
            createButton(`mod:warn:cancel:${target.id}`, "Cancel", ButtonStyle.Secondary)
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function caseListPanel(cases, guild, page = 0, perPage = 10) {
    const start = page * perPage;
    const end = start + perPage;
    const pageCases = cases.slice(start, end);
    const totalPages = Math.ceil(cases.length / perPage);
    
    const components = [
        headerText(`${Brand.mark} Case List`),
        divider(),
        bodyText(`**Total Cases:** ${cases.length}`),
        divider(),
    ];
    
    if (pageCases.length === 0) {
        components.push(bodyText("No cases found."));
    } else {
        for (const c of pageCases) {
            const status = c.resolved ? "✓" : "●";
            components.push(bodyText(`${status} **#${c.caseNumber}** · ${c.action} · <@${c.targetId}> · ${c.reason || "No reason"} · <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:R>`));
        }
    }
    
    if (totalPages > 1) {
        components.push(divider());
        components.push(createActionRow(
            createButton(`mod:cases:prev:${page}`, "Previous", ButtonStyle.Secondary, page === 0),
            createButton(`mod:cases:next:${page}`, "Next", ButtonStyle.Secondary, page >= totalPages - 1),
        ));
        components.push(mutedText(`Page ${page + 1} of ${totalPages}`));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function modStatsPanel(stats, moderator, guild) {
    const components = [
        headerText(`${Brand.mark} Moderation Statistics`),
        divider(),
        bodyText(`**Moderator:** ${moderator ? `<@${moderator.id}>` : "All Moderators"}`),
        divider(),
    ];
    
    if (moderator) {
        components.push(bodyText(`**Total Actions:** ${stats.count || 0}`));
        if (stats.recent?.length) {
            components.push(subHeaderText("Recent Actions"));
            for (const c of stats.recent.slice(0, 5)) {
                components.push(bodyText(`**#${c.caseNumber}** · ${c.action} · <@${c.targetId}> · <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:R>`));
            }
        }
    } else {
        components.push(bodyText(`**Total Cases:** ${stats.total || 0}`));
        if (stats.byAction?.length) {
            components.push(subHeaderText("By Action"));
            for (const a of stats.byAction) {
                components.push(bodyText(`${a.action}: ${a._count._all}`));
            }
        }
        if (stats.topMods?.length) {
            components.push(subHeaderText("Top Moderators"));
            for (const m of stats.topMods.slice(0, 5)) {
                components.push(bodyText(`<@${m.moderatorId}>: ${m._count.moderatorId}`));
            }
        }
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}