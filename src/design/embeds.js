import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, time, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, ThumbnailBuilder, MediaGalleryBuilder } from "discord.js";
import { Theme, Brand } from "./theme.js";
import * as containers from "./containers/base.js";
import * as panels from "./containers/panels.js";
import * as moderation from "./containers/moderation.js";
import * as tickets from "./containers/tickets.js";
import * as settings from "./containers/settings.js";
import * as help from "./containers/help.js";

const COLORS = {
    success: Theme.success,
    error: Theme.danger,
    warn: Theme.warn,
    info: Theme.info,
    moderation: Theme.accent,
    neutral: Theme.accent,
    panel: Theme.panel,
    ticket: Theme.ticket,
};

function build(kind, opts) {
    const embed = new EmbedBuilder()
        .setColor(COLORS[kind] ?? Theme.accent)
        .setTimestamp();
    if (opts.title) {
        const title = opts.title.includes(Brand.mark) || opts.title.match(/^[📜🪽🛒🛟📊✦]/) ? opts.title : `${opts.title}`;
        embed.setTitle(title);
    }
    if (opts.author) {
        embed.setAuthor({ name: opts.author.name ?? Brand.name, iconURL: opts.author.iconURL ?? undefined });
    }
    if (opts.description) {
        embed.setDescription(opts.description);
    }
    if (opts.fields?.length) {
        const clean = opts.fields.map((f) => ({
            name: f.name?.trim() ?? "—",
            value: (f.value?.trim() ?? "—").slice(0, 1024) || "—",
            inline: f.inline ?? false,
        }));
        embed.addFields(clean);
    }
    if (opts.thumbnailUrl) embed.setThumbnail(opts.thumbnailUrl);
    if (opts.imageUrl) embed.setImage(opts.imageUrl);
    const footerText = opts.footer ?? Brand.footer;
    if (opts.footerIcon) embed.setFooter({ text: footerText, iconURL: opts.footerIcon });
    else embed.setFooter({ text: footerText });
    if (opts.url) embed.setURL(opts.url);
    return embed;
}

export const embeds = {
    success: (title, description, fields, opts = {}) => build("success", { title, description, fields, ...opts }),
    error: (title, description, fields, opts = {}) => build("error", { title, description, fields, ...opts }),
    warn: (title, description, fields, opts = {}) => build("warn", { title, description, fields, ...opts }),
    info: (title, description, fields, opts = {}) => build("info", { title, description, fields, ...opts }),
    moderation: (title, description, fields, opts = {}) => build("moderation", { title, description, fields, ...opts }),
    neutral: (title, description, fields, opts = {}) => build("neutral", { title, description, fields, ...opts }),
    panel: (title, description, fields, opts = {}) => build("panel", { title, description, fields, ...opts }),
    ticket: (title, description, fields, opts = {}) => build("ticket", { title, description, fields, ...opts }),
};

export function confirmationRow(opts) {
    const accept = new ButtonBuilder()
        .setCustomId(opts.acceptCustomId)
        .setLabel(opts.acceptLabel ?? "Confirm")
        .setStyle(opts.danger ? ButtonStyle.Danger : ButtonStyle.Primary);
    const cancel = new ButtonBuilder()
        .setCustomId(opts.cancelCustomId)
        .setLabel(opts.cancelLabel ?? "Cancel")
        .setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder().addComponents(accept, cancel);
}

export function categorySelect(customId, placeholder, options) {
    const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options);
    return new ActionRowBuilder().addComponents(menu);
}

export function formatCaseLine(c) {
    return `#${c.caseNumber} · ${c.action} · ${c.reason ?? "No reason"} · ${time(c.createdAt, "R")}`;
}

export const ui = {
    containers,
    panels,
    moderation,
    tickets,
    settings,
    help,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
};
//# sourceMappingURL=embeds.js.map