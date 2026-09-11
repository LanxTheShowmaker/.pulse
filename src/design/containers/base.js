import { ContainerComponent, SectionComponent, TextDisplayComponent, SeparatorComponent, ThumbnailComponent, MediaGalleryComponent, MessageFlags, ButtonStyle } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, SelectMenuBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../theme.js";

export { ButtonStyle, MessageFlags } from "discord.js";
export { Brand, Theme } from "../theme.js";

export function createContainer(components) {
    const arr = Array.isArray(components) ? components : [components];
    return new ContainerComponent({ components: arr });
}

export function createSection(textComponents, accessory = null) {
    const arr = Array.isArray(textComponents) ? textComponents : [textComponents];
    const textParts = arr.map(tc => {
        if (tc instanceof TextDisplayComponent) return tc;
        return new TextDisplayComponent({ content: String(tc) });
    });
    const opts = { components: textParts };
    if (accessory instanceof ThumbnailComponent) {
        opts.accessory = accessory;
    } else if (accessory instanceof ButtonBuilder) {
        opts.accessory = accessory;
    }
    return new SectionComponent(opts);
}

export function createTextDisplay(content) {
    return new TextDisplayComponent({ content });
}

export function createSeparator(divider = true, spacing = "Small") {
    const spacingMap = { Small: 1, Large: 2 };
    return new SeparatorComponent({ divider, spacing: spacingMap[spacing] ?? spacing });
}

export function createThumbnail(url) {
    return new ThumbnailComponent({ media: { url } });
}

export function createMediaGallery(urls) {
    return new MediaGalleryComponent({ items: urls.map(url => ({ media: { url } })) });
}

export function createActionRow(...components) {
    return new ActionRowBuilder().addComponents(components);
}

export function createButton(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
    const button = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
    if (emoji) button.setEmoji(emoji);
    return button;
}

export function createSelectMenu(customId, placeholder, options, minValues = 1, maxValues = 1, disabled = false) {
    const menu = new SelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(minValues).setMaxValues(maxValues).setDisabled(disabled);
    options.forEach(opt => menu.addOptions(opt));
    return menu;
}

export function createSelectOption(label, value, description = null, emoji = null, defaultOpt = false) {
    const opt = { label, value };
    if (description) opt.description = description;
    if (emoji) opt.emoji = emoji;
    if (defaultOpt) opt.default = true;
    return opt;
}

function toContainer(components) {
    if (components instanceof ContainerComponent) return components;
    return createContainer(components);
}

export function containerReply(interaction, components, ephemeral = false) {
    return interaction.reply({ components: [toContainer(components)], flags: ephemeral ? MessageFlags.Ephemeral : 0 });
}

export function containerEdit(interaction, components) {
    return interaction.editReply({ components: [toContainer(components)] });
}

export function containerFollowUp(interaction, components, ephemeral = false) {
    return interaction.followUp({ components: [toContainer(components)], flags: ephemeral ? MessageFlags.Ephemeral : 0 });
}

export function headerText(text) {
    return createTextDisplay(`## ${text}`);
}

export function subHeaderText(text) {
    return createTextDisplay(`### ${text}`);
}

export function bodyText(text) {
    return createTextDisplay(text);
}

export function mutedText(text) {
    return createTextDisplay(`-# ${text}`);
}

export function codeText(text) {
    return createTextDisplay(`\`${text}\``);
}

export function fieldText(name, value, inline = false) {
    if (inline) {
        return createTextDisplay(`**${name}**\n${value}`);
    }
    return createTextDisplay(`**${name}**\n${value}`);
}

export function divider() {
    return createSeparator(true, "Small");
}

export function spacer() {
    return createSeparator(false, "Large");
}
