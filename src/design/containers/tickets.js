import { createContainer, createActionRow, createButton, ButtonStyle, createSelectMenu, createSelectOption, divider, headerText, bodyText, mutedText, spacer, subHeaderText } from "./base.js";
import { Theme, Brand } from "../../design/theme.js";

export function ticketCreatePanel(types) {
    const options = types.map(t => createSelectOption(t.displayName, t.key, t.description, t.emoji));
    const components = [
        headerText("Create Ticket"),
        divider(),
        bodyText("Select the type of ticket you'd like to create:"),
        divider(),
        createActionRow(createSelectMenu("ticket:create:select", "Choose ticket type...", options)),
        spacer(),
        mutedText(Brand.footer),
    ];
    return createContainer(components);
}

export function ticketControlPanel(ticket, typeConfig, isStaff, isClaimer) {
    const components = [
        headerText(`Ticket #${ticket.id.slice(0, 8)}`),
        divider(),
        bodyText(`**Type:** ${typeConfig?.displayName || ticket.panelType}`),
        bodyText(`**Status:** ${ticket.status}`),
        bodyText(`**Priority:** ${ticket.priority}`),
        bodyText(`**Opened by:** <@${ticket.openerId}>`),
    ];
    if (ticket.claimedById) {
        components.push(bodyText(`**Claimed by:** <@${ticket.claimedById}>`));
    }
    if (ticket.closedAt) {
        components.push(bodyText(`**Closed:** <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`));
    }
    components.push(divider());

    const buttons = [];
    if (isStaff) {
        if (ticket.status === "OPEN" && !ticket.claimedById) {
            buttons.push(createButton(`ticket:claim:${ticket.channelId}`, "Claim", ButtonStyle.Success));
        } else if (ticket.status === "OPEN" && ticket.claimedById && isClaimer) {
            buttons.push(createButton(`ticket:unclaim:${ticket.channelId}`, "Unclaim", ButtonStyle.Secondary));
        }
        if (ticket.status !== "CLOSED") {
            buttons.push(createButton(`ticket:close:${ticket.channelId}`, "Close", ButtonStyle.Danger));
        }
        if (ticket.status === "CLOSED") {
            buttons.push(createButton(`ticket:reopen:${ticket.channelId}`, "Reopen", ButtonStyle.Success));
        }
        buttons.push(createButton(`ticket:info:${ticket.channelId}`, "Info", ButtonStyle.Secondary));
    } else {
        if (ticket.status !== "CLOSED") {
            buttons.push(createButton(`ticket:close:${ticket.channelId}`, "Close Ticket", ButtonStyle.Danger));
        }
    }
    if (buttons.length) components.push(createActionRow(...buttons));

    if (isStaff) {
        const priorityMenu = createSelectMenu(`ticket:priority:${ticket.channelId}`, "Set priority", [
            createSelectOption("Low", "LOW"),
            createSelectOption("Normal", "NORMAL"),
            createSelectOption("High", "HIGH"),
            createSelectOption("Urgent", "URGENT"),
        ]);
        const statusMenu = createSelectMenu(`ticket:status:${ticket.channelId}`, "Set status", [
            createSelectOption("Open", "OPEN"),
            createSelectOption("Claimed", "CLAIMED"),
            createSelectOption("Waiting", "WAITING"),
            createSelectOption("In Progress", "IN_PROGRESS"),
            createSelectOption("Completed", "COMPLETED"),
            createSelectOption("Closed", "CLOSED"),
        ]);
        components.push(createActionRow(priorityMenu));
        components.push(createActionRow(statusMenu));
    }

    components.push(spacer());
    components.push(mutedText(Brand.footer));
    return createContainer(components);
}

export function ticketClosedPanel(ticket, transcriptUrl = null) {
    const components = [
        headerText("Ticket Closed"),
        divider(),
        bodyText(`**Ticket:** #${ticket.id.slice(0, 8)}`),
        bodyText(`**Status:** Closed`),
        bodyText(`**Closed:** <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`),
    ];
    if (ticket.closedById) {
        components.push(bodyText(`**Closed by:** <@${ticket.closedById}>`));
    }
    if (transcriptUrl) {
        components.push(divider());
        components.push(createActionRow(
            createButton(`ticket:transcript:${ticket.channelId}`, "View Transcript", ButtonStyle.Primary)
        ));
    }
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    return createContainer(components);
}

export function ticketTypeConfigPanel(types, guild) {
    const components = [
        headerText("Ticket Types"),
        bodyText(`Managing ticket types for **${guild.name}**`),
        divider(),
    ];
    if (types.length === 0) {
        components.push(bodyText("No ticket types configured. Use `/tickets create-type` to add one."));
    } else {
        for (const t of types) {
            const staffRoles = (() => { try { return JSON.parse(t.staffRoleIds ?? "[]"); } catch { return []; } })();
            components.push(bodyText(`**${t.displayName}** (\`${t.key}\`)\n${t.description || "No description"}\n-# Category: ${t.categoryId ? `<#${t.categoryId}>` : "Auto"} | Staff: ${staffRoles.length ? staffRoles.map(r => `<@&${r}>`).join(", ") : "None"} | Enabled: ${t.enabled ? "Yes" : "No"}`));
            components.push(divider());
        }
    }
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    return createContainer(components);
}

export function ticketTypeEditPanel(type, guild) {
    const staffRoles = (() => { try { return JSON.parse(type.staffRoleIds ?? "[]"); } catch { return []; } })();
    const modRoles = (() => { try { return JSON.parse(type.moderatorRoleIds ?? "[]"); } catch { return []; } })();
    const components = [
        headerText(`Edit Ticket Type \u2014 ${type.displayName}`),
        divider(),
        bodyText(`**Key:** \`${type.key}\``),
        bodyText(`**Description:** ${type.description || "None"}`),
        bodyText(`**Category:** ${type.categoryId ? `<#${type.categoryId}>` : "Auto"}`),
        bodyText(`**Staff Roles:** ${staffRoles.length ? staffRoles.map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Moderator Roles:** ${modRoles.length ? modRoles.map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Prefix:** ${type.channelPrefix || "ticket"}`),
        bodyText(`**Priority:** ${type.priority}`),
        bodyText(`**Cooldown:** ${type.cooldown}s`),
        bodyText(`**Max Open:** ${type.maxOpen}`),
        bodyText(`**Allow Claim:** ${type.allowClaim ? "Enabled" : "Disabled"}`),
        bodyText(`**Enabled:** ${type.enabled ? "Enabled" : "Disabled"}`),
        spacer(),
        mutedText(Brand.footer),
    ];
    return createContainer(components);
}

export function ticketStatsPanel(stats) {
    const components = [
        headerText("Ticket Statistics"),
        divider(),
        bodyText(`**Open:** ${stats.open}`),
        bodyText(`**Claimed:** ${stats.claimed}`),
        bodyText(`**Closed:** ${stats.closed}`),
        bodyText(`**Total:** ${stats.total}`),
        spacer(),
        mutedText(Brand.footer),
    ];
    return createContainer(components);
}

export function ticketListPanel(tickets, page, total) {
    const totalPages = Math.ceil(total / 10);
    const components = [
        headerText("Open Tickets"),
        divider(),
    ];
    if (tickets.length === 0) {
        components.push(bodyText("No tickets found."));
    } else {
        for (const t of tickets) {
            const claimed = t.claimedById ? ` \u2022 Claimed by <@${t.claimedById}>` : "";
            components.push(bodyText(`**${t.category}** \u2022 <@${t.openerId}> \u2022 \`${t.shortId}\` \u2022 ${t.status}${claimed}`));
        }
    }
    if (totalPages > 1) {
        components.push(divider());
        components.push(createActionRow(
            createButton(`ticket:list:${page}`, "Previous", ButtonStyle.Secondary, page === 0),
            createButton(`ticket:list:${page + 2}`, "Next", ButtonStyle.Secondary, page >= totalPages - 1),
        ));
        components.push(mutedText(`Page ${page + 1} of ${totalPages}`));
    }
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    return createContainer(components);
}
