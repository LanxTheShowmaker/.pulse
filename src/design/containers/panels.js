import { createContainer, createSection, createTextDisplay, createThumbnail, createActionRow, createButton, ButtonStyle, divider, headerText, subHeaderText, bodyText, mutedText, spacer, createSelectMenu, createSelectOption } from "./base.js";
import { Theme, Brand } from "../../design/theme.js";

export function infoPanel(title, description, fields = [], opts = {}) {
    const components = [];
    
    if (opts.thumbnail) {
        components.push(createThumbnail(opts.thumbnail));
    }
    
    components.push(headerText(title));
    
    if (description) {
        components.push(bodyText(description));
    }
    
    if (fields.length) {
        components.push(divider());
        for (const field of fields) {
            components.push(bodyText(`**${field.name}**\n${field.value}`));
        }
    }
    
    if (opts.footer) {
        components.push(spacer());
        components.push(mutedText(opts.footer));
    } else {
        components.push(spacer());
        components.push(mutedText(Brand.footer));
    }
    
    if (opts.components) {
        components.push(...opts.components);
    }
    
    return createContainer(components);
}

export function moderationCasePanel(caseData, guild, moderator, target) {
    const components = [
        headerText(`Case #${caseData.caseNumber} · ${caseData.action}`),
        divider(),
        bodyText(`**Target:** <@${caseData.targetId}> (\`${caseData.targetTag}\`)`),
        bodyText(`**Moderator:** <@${caseData.moderatorId}> (\`${caseData.moderatorTag}\`)`),
        bodyText(`**Reason:** ${caseData.reason || "No reason provided"}`),
        bodyText(`**Timestamp:** <t:${Math.floor(new Date(caseData.createdAt).getTime() / 1000)}:F>`),
    ];
    
    if (caseData.duration) {
        components.push(bodyText(`**Duration:** ${caseData.duration}`));
    }
    
    if (caseData.resolved) {
        components.push(bodyText(`**Status:** Resolved by <@${caseData.resolvedById}> at <t:${Math.floor(new Date(caseData.resolvedAt).getTime() / 1000)}:R>`));
    } else {
        components.push(bodyText("**Status:** Active"));
    }
    
    if (caseData.metadata) {
        try {
            const meta = JSON.parse(caseData.metadata);
            if (Object.keys(meta).length) {
                components.push(divider());
                components.push(subHeaderText("Metadata"));
                for (const [key, value] of Object.entries(meta)) {
                    components.push(bodyText(`**${key}:** ${value}`));
                }
            }
        } catch {}
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function ticketPanel(ticketData, typeConfig = null) {
    const components = [
        headerText(`Ticket #${ticketData.id.slice(0, 8)}`),
        divider(),
        bodyText(`**Type:** ${typeConfig?.displayName || ticketData.panelType || "General"}`),
        bodyText(`**Status:** ${ticketData.status}`),
        bodyText(`**Opened by:** <@${ticketData.openerId}>`),
        bodyText(`**Created:** <t:${Math.floor(new Date(ticketData.createdAt).getTime() / 1000)}:R>`),
    ];
    
    if (ticketData.claimedById) {
        components.push(bodyText(`**Claimed by:** <@${ticketData.claimedById}>`));
    }
    
    if (ticketData.closedAt) {
        components.push(bodyText(`**Closed:** <t:${Math.floor(new Date(ticketData.closedAt).getTime() / 1000)}:R>`));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function settingsPanel(guild, config, sections = []) {
    const components = [
        headerText(`Server Settings`),
        bodyText(`Configuring **${guild.name}**`),
        divider(),
    ];
    
    for (const section of sections) {
        components.push(subHeaderText(section.title));
        if (section.description) {
            components.push(bodyText(section.description));
        }
        if (section.fields?.length) {
            for (const field of section.fields) {
                components.push(bodyText(`**${field.name}:** ${field.value}`));
            }
        }
        components.push(divider());
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function helpPanel(commands, category = null) {
    const components = [
        headerText(`Command Help`),
    ];
    
    if (category) {
        components.push(bodyText(`Category: **${category}**`));
    }
    
    components.push(divider());
    
    for (const cmd of commands) {
        const options = cmd.data.options?.map(o => `\`${o.name}\``).join(", ") || "none";
        components.push(bodyText(`**/${cmd.data.name}** — ${cmd.data.description}\n-# Options: ${options}`));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function confirmDialog(title, description, acceptId, cancelId, danger = false) {
    const components = [
        headerText(title),
        divider(),
        bodyText(description),
        divider(),
        createActionRow(
            createButton(acceptId, "Confirm", danger ? ButtonStyle.Danger : ButtonStyle.Primary),
            createButton(cancelId, "Cancel", ButtonStyle.Secondary)
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function paginationPanel(items, page, perPage, renderItem, title, customIdPrefix) {
    const start = page * perPage;
    const end = start + perPage;
    const pageItems = items.slice(start, end);
    const totalPages = Math.ceil(items.length / perPage);
    
    const components = [
        headerText(title),
        divider(),
    ];
    
    for (const item of pageItems) {
        components.push(renderItem(item));
    }
    
    if (totalPages > 1) {
        components.push(divider());
        components.push(createActionRow(
            createButton(`${customIdPrefix}:prev`, "Previous", ButtonStyle.Secondary, page === 0),
            createButton(`${customIdPrefix}:next`, "Next", ButtonStyle.Secondary, page >= totalPages - 1),
        ));
        components.push(mutedText(`Page ${page + 1} of ${totalPages}`));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function userProfilePanel(user, member, stats = {}) {
    const components = [];
    
    if (member?.user.displayAvatarURL()) {
        components.push(createThumbnail(member.user.displayAvatarURL({ size: 256 })));
    }
    
    components.push(headerText(`${user.username}'s Profile`));
    components.push(bodyText(`**ID:** \`${user.id}\``));
    components.push(bodyText(`**Account Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`));
    
    if (member) {
        components.push(bodyText(`**Joined Server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`));
        if (member.roles.cache.size > 1) {
            const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(" ") || "None";
            components.push(bodyText(`**Roles:** ${roles}`));
        }
    }
    
    if (Object.keys(stats).length) {
        components.push(divider());
        components.push(subHeaderText("Statistics"));
        for (const [key, value] of Object.entries(stats)) {
            components.push(bodyText(`**${key}:** ${value}`));
        }
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function serverInfoPanel(guild, stats = {}) {
    const components = [];
    
    if (guild.iconURL()) {
        components.push(createThumbnail(guild.iconURL({ size: 256 })));
    }
    
    components.push(headerText(`${guild.name}`));
    components.push(bodyText(`**ID:** \`${guild.id}\``));
    components.push(bodyText(`**Owner:** <@${guild.ownerId}>`));
    components.push(bodyText(`**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`));
    components.push(bodyText(`**Members:** ${guild.memberCount}`));
    components.push(bodyText(`**Boost Level:** ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`));
    components.push(bodyText(`**Channels:** ${guild.channels.cache.size}`));
    components.push(bodyText(`**Roles:** ${guild.roles.cache.size}`));
    components.push(bodyText(`**Emojis:** ${guild.emojis.cache.size}`));
    
    if (Object.keys(stats).length) {
        components.push(divider());
        components.push(subHeaderText("Additional Stats"));
        for (const [key, value] of Object.entries(stats)) {
            components.push(bodyText(`**${key}:** ${value}`));
        }
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function errorPanel(title, message, details = null) {
    const components = [
        headerText(title),
        divider(),
        bodyText(message),
    ];
    
    if (details) {
        components.push(divider());
        components.push(codeText(details));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function successPanel(title, message, details = null) {
    const components = [
        headerText(title),
        divider(),
        bodyText(message),
    ];
    
    if (details) {
        components.push(divider());
        components.push(bodyText(details));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}