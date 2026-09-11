import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "./theme.js";

function base(color) {
    return new EmbedBuilder().setColor(color).setFooter({ text: Brand.footer, iconURL: Brand.icon || undefined });
}

export function success(title, desc)  { return base(Theme.success).setTitle(title).setDescription(desc); }
export function error(title, desc)    { return base(Theme.danger).setTitle(title).setDescription(desc); }
export function warn(title, desc)     { return base(Theme.warn).setTitle(title).setDescription(desc); }
export function info(title, desc)     { return base(Theme.info).setTitle(title).setDescription(desc); }
export function neutral(title, desc)  { return base(Theme.muted).setTitle(title).setDescription(desc); }
export function panel(title, desc)    { return base(Theme.panel).setTitle(title).setDescription(desc); }
