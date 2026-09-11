import { ActionRowBuilder, ButtonBuilder, SelectMenuBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { ButtonStyle, TextInputStyle } from "discord.js";
import { Theme } from "./theme.js";

// Button factory with consistent semantics
export function btn(opts){
    // opts: id, label, style, emoji, disabled, url
    const b=new ButtonBuilder().setCustomId(opts.id).setLabel(opts.label.slice(0,80));
    if(opts.url) b.setURL(opts.url).setStyle(ButtonStyle.Link);
    else b.setStyle(opts.style ?? ButtonStyle.Secondary);
    if(opts.emoji) b.setEmoji(opts.emoji);
    if(opts.disabled) b.setDisabled(true);
    return b;
}
export const Buttons={
    primary: (id,label,emoji)=> btn({ id, label, style:ButtonStyle.Primary, emoji }),
    secondary: (id,label,emoji)=> btn({ id, label, style:ButtonStyle.Secondary, emoji }),
    success: (id,label,emoji)=> btn({ id, label, style:ButtonStyle.Success, emoji }),
    danger: (id,label,emoji)=> btn({ id, label, style:ButtonStyle.Danger, emoji }),
    link: (label,url,emoji)=> btn({ id:"link", label, url, emoji }),
};

// Select menu factory
export function selectMenu(id, placeholder, options, opts={}){
    const menu=new SelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder.slice(0,150));
    if(opts.min!==undefined) menu.setMinValues(opts.min);
    if(opts.max!==undefined) menu.setMaxValues(opts.max);
    menu.addOptions(options.slice(0,25).map(o=>({
        label: String(o.label).slice(0,100),
        value: String(o.value).slice(0,100),
        description: o.description ? String(o.description).slice(0,100) : undefined,
        emoji: o.emoji,
        default: o.default,
    })));
    return new ActionRowBuilder().addComponents(menu);
}

// Pagination
export function paginationRow(current, total, baseId, opts={}){
    const prev=new ButtonBuilder().setCustomId(`${baseId}:prev:${current}`).setLabel(opts.prevLabel||"Previous").setStyle(ButtonStyle.Secondary).setDisabled(current<=1);
    const next=new ButtonBuilder().setCustomId(`${baseId}:next:${current}`).setLabel(opts.nextLabel||"Next").setStyle(ButtonStyle.Secondary).setDisabled(current>=total);
    const indicator=new ButtonBuilder().setCustomId(`${baseId}:indicator`).setLabel(`Page ${current}/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
    const row=new ActionRowBuilder().addComponents(prev, indicator, next);
    if(opts.firstLast){
        const first=new ButtonBuilder().setCustomId(`${baseId}:first`).setLabel("First").setStyle(ButtonStyle.Secondary).setDisabled(current<=1);
        const last=new ButtonBuilder().setCustomId(`${baseId}:last`).setLabel("Last").setStyle(ButtonStyle.Secondary).setDisabled(current>=total);
        return new ActionRowBuilder().addComponents(first, prev, indicator, next, last);
    }
    return row;
}
export function paginationFooter(current,total,totalItems){
    return `Page ${current}/${total} • ${totalItems} total`;
}

// Confirmation
export function confirmRow(acceptId, cancelId, opts={}){
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(acceptId).setLabel(opts.acceptLabel||"Confirm").setStyle(opts.danger? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(cancelId).setLabel(opts.cancelLabel||"Cancel").setStyle(ButtonStyle.Secondary)
    );
}
export function confirmEmbed(title, description, target){
    // Returns embed data for confirmation
    return {
        title: title || "Confirm Action",
        description: `${description}\n\n**Target:** \`${target||"—"}\`\n**Consequence:** This action cannot be undone without manual intervention.`,
    };
}

// Error / Success
export function errorEmbed(title, reason, action){
    return {
        title: title || "Request Failed",
        description: reason ? `**Reason:** ${reason.slice(0,500)}` : "Unable to complete the request. Please try again.",
        footer: action ? `Action: ${action}` : undefined,
    };
}
export function successEmbed(title, description){
    return { title: title || "Success", description: description || "Completed successfully." };
}

// Loading
export function loadingEmbed(title, description){
    return {
        title: title || "Processing",
        description: description || "Processing request...",
    };
}

// Modal helpers
export function modal(id, title, fields){
    const m=new ModalBuilder().setCustomId(id).setTitle(title.slice(0,45));
    for(const f of fields.slice(0,5)){
        const input=new TextInputBuilder().setCustomId(f.id).setLabel(f.label.slice(0,45)).setStyle(f.paragraph? TextInputStyle.Paragraph : TextInputStyle.Short);
        if(f.value) input.setValue(String(f.value).slice(0, f.paragraph?4000:400));
        if(f.placeholder) input.setPlaceholder(String(f.placeholder).slice(0,100));
        if(f.required!==undefined) input.setRequired(!!f.required);
        if(f.min) input.setMinLength(f.min);
        if(f.max) input.setMaxLength(f.max);
        m.addComponents(new ActionRowBuilder().addComponents(input));
    }
    return m;
}
