import { createContainer, createActionRow, createButton, ButtonStyle, divider, headerText, bodyText, mutedText, spacer, createSelectMenu, createSelectOption, subHeaderText } from "./base.js";
import { Theme, Brand } from "../../design/theme.js";

export function ticketCreatePanel(types) {
    const options = types.map(t => createSelectOption(t.displayName, t.key, t.description, t.emoji));
    
    const components = [
        headerText(`Create Ticket`),
        divider(),
        bodyText("Select the type of ticket you'd like to create:"),
        divider(),
        createActionRow(
            createSelectMenu("ticket:create:select", "Choose ticket type...", options)
        ),
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
        bodyText(`**Opened by:** <@${ticket.openerId}>`),
    ];
    
    if (ticket.claimedById) {
        components.push(bodyText(`**Claimed by:** <@${ticket.claimedById}>`));
    }
    
    components.push(divider());
    
    const buttons = [];
    
    if (isStaff) {
        if (ticket.status === "OPEN" && !ticket.claimedById) {
            buttons.push(createButton(`ticket:claim:${ticket.id}`, "Claim", ButtonStyle.Primary));
        } else if (ticket.status === "OPEN" && ticket.claimedById && isClaimer) {
            buttons.push(createButton(`ticket:unclaim:${ticket.id}`, "Unclaim", ButtonStyle.Secondary));
        }
        
        if (ticket.status === "OPEN") {
            buttons.push(createButton(`ticket:close:${ticket.id}`, "Close", ButtonStyle.Danger));
        } else if (ticket.status === "CLOSED") {
            buttons.push(createButton(`ticket:reopen:${ticket.id}`, "Reopen", ButtonStyle.Success));
        }
    } else {
        if (ticket.status === "OPEN") {
            buttons.push(createButton(`ticket:close:${ticket.id}`, "Close Ticket", ButtonStyle.Danger));
        }
    }
    
    if (buttons.length) {
        components.push(createActionRow(...buttons));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function ticketClosedPanel(ticket, transcriptUrl = null) {
    const components = [
        headerText(`Ticket Closed`),
        divider(),
        bodyText(`**Ticket:** #${ticket.id.slice(0, 8)}`),
        bodyText(`**Status:** Closed`),
        bodyText(`**Closed:** <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`),
    ];
    
    if (transcriptUrl) {
        components.push(divider());
        components.push(createActionRow(
            createButton(`ticket:transcript:${ticket.id}`, "View Transcript", ButtonStyle.Primary)
        ));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function ticketTypeConfigPanel(types, guild) {
    const components = [
        headerText(`Ticket Types Configuration`),
        bodyText(`Managing ticket types for **${guild.name}**`),
        divider(),
    ];
    
    if (types.length === 0) {
        components.push(bodyText("No ticket types configured. Use the button below to create one."));
    } else {
        for (const t of types) {
            components.push(bodyText(`**${t.displayName}** (\`${t.key}\`)\n${t.description || "No description"}\n-# Category: <#${t.categoryId || "none"}> | Staff: ${t.staffRoleIds ? t.staffRoleIds.split(",").map(r => `<@&${r}>`).join(", ") : "none"} | Enabled: ${t.enabled ? "Enabled" : "Disabled"}`));
            components.push(divider());
        }
    }
    
    components.push(createActionRow(
        createButton("ticket:config:create", "Create Type", ButtonStyle.Primary),
        createButton("ticket:config:refresh", "Refresh", ButtonStyle.Secondary)
    ));
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function ticketTypeEditPanel(type, guild) {
    const components = [
        headerText(`Edit Ticket Type — ${type.displayName}`),
        divider(),
        bodyText(`**Key:** \`${type.key}\``),
        bodyText(`**Description:** ${type.description || "None"}`),
        bodyText(`**Category:** <#${type.categoryId || "none"}>`),
        bodyText(`**Staff Roles:** ${type.staffRoleIds ? type.staffRoleIds.split(",").map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Moderator Roles:** ${type.moderatorRoleIds ? type.moderatorRoleIds.split(",").map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Prefix:** ${type.channelPrefix || "ticket"}`),
        bodyText(`**Priority:** ${type.priority}`),
        bodyText(`**Cooldown:** ${type.cooldown}s`),
        bodyText(`**Max Open:** ${type.maxOpen}`),
        bodyText(`**Allow Claim:** ${type.allowClaim ? "Enabled" : "Disabled"}`),
        bodyText(`**Enabled:** ${type.enabled ? "Enabled" : "Disabled"}`),
        divider(),
        createActionRow(
            createButton(`ticket:type:edit:${type.key}`, "Edit", ButtonStyle.Primary),
            createButton(`ticket:type:delete:${type.key}`, "Delete", ButtonStyle.Danger),
            createButton(`ticket:config:refresh`, "Back", ButtonStyle.Secondary)
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}