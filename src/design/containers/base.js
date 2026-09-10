import { ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, ThumbnailBuilder, MediaGalleryBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } from "discord.js";
import { Theme, Brand } from "../theme.js";

export { ButtonStyle } from "discord.js";
export { Brand, Theme } from "../theme.js";

export function createContainer(components) {
    return new ContainerBuilder().addComponents(components);
}

export function createSection(textComponents, accessory = null) {
    const section = new SectionBuilder().addComponents(textComponents);
    if (accessory) section.setAccessory(accessory);
    return section;
}

export function createTextDisplay(content) {
    return new TextDisplayBuilder().setContent(content);
}

export function createSeparator(divider = true, spacing = "Small") {
    return new SeparatorBuilder().setDivider(divider).setSpacing(spacing);
}

export function createThumbnail(url) {
    return new ThumbnailBuilder().setURL(url);
}

export function createMediaGallery(urls) {
    return new MediaGalleryBuilder().addItems(urls.map(url => ({ media: { url } })));
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
    const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(minValues).setMaxValues(maxValues).setDisabled(disabled);
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

export function containerReply(interaction, components, ephemeral = false) {
    return interaction.reply({ components: [createContainer(components)], flags: ephemeral ? 64 : 0 });
}

export function containerEdit(interaction, components) {
    return interaction.editReply({ components: [createContainer(components)] });
}

export function containerFollowUp(interaction, components, ephemeral = false) {
    return interaction.followUp({ components: [createContainer(components)], flags: ephemeral ? 64 : 0 });
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