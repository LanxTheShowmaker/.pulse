import { ActionRowBuilder, ButtonBuilder, SelectMenuBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { ButtonStyle, TextInputStyle } from "discord.js";
import { Theme } from "./theme.js";

export function button(label, customId, style = ButtonStyle.Primary, disabled = false) {
    return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(style).setDisabled(disabled);
}

export function linkButton(label, url) {
    return new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
}

export function selectMenu(customId, placeholder, options) {
    return new SelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(options.map(o => ({ label: o.label, value: o.value, description: o.description, emoji: o.emoji })));
}

export function row(...components) {
    return new ActionRowBuilder().addComponents(...components);
}

export function confirmRow(yesId, noId) {
    return row(
        button("Confirm", yesId, ButtonStyle.Danger),
        button("Cancel", noId, ButtonStyle.Secondary),
    );
}

export function modal(title, customId, ...inputs) {
    const m = new ModalBuilder().setTitle(title).setCustomId(customId);
    for (const inp of inputs) {
        m.addComponents(row(
            new TextInputBuilder()
                .setLabel(inp.label)
                .setCustomId(inp.id)
                .setStyle(inp.style ?? TextInputStyle.Short)
                .setRequired(inp.required ?? true)
                .setPlaceholder(inp.placeholder ?? "")
                .setValue(inp.value ?? "")
                .setMaxLength(inp.maxLength ?? 1000),
        ));
    }
    return m;
}
