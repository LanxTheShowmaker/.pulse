import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "./theme.js";

function base(color) {
    return new EmbedBuilder().setColor(color).setFooter({ text: Brand.footer, iconURL: Brand.icon || undefined }).setTimestamp();
}

export function success(title, desc)  { return base(Theme.success).setTitle(`${Brand.mark} ${title}`).setDescription(desc); }
export function error(title, desc)    { return base(Theme.danger).setTitle(`${Brand.mark} ${title}`).setDescription(desc); }
export function warn(title, desc)     { return base(Theme.warn).setTitle(`${Brand.mark} ${title}`).setDescription(desc); }
export function info(title, desc)     { return base(Theme.info).setTitle(`${Brand.mark} ${title}`).setDescription(desc); }
export function neutral(title, desc)  { return base(Theme.muted).setTitle(`${Brand.mark} ${title}`).setDescription(desc); }
export function panel(title, desc)    { return base(Theme.panel).setTitle(`${Brand.mark} ${title}`).setDescription(desc); }

export function profile(user, desc) {
    return base(Theme.panel)
        .setTitle(`${Brand.mark} ${user.username}`)
        .setDescription(desc)
        .setThumbnail(user.displayAvatarURL());
}

export function confirmation(title, desc) {
    return base(Theme.warn).setTitle(`${Brand.mark} ${title}`).setDescription(desc);
}

export function stat(name, value, inline = true) {
    return { name, value: `${value}`, inline };
}

export function progressBar(current, max, length = 10) {
    const filled = Math.round((current / max) * length);
    return "█".repeat(filled) + "░".repeat(length - filled);
}

export function cooldownDisplay(remaining, total) {
    const elapsed = total - remaining;
    const bar = progressBar(elapsed, total, 8);
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    const s = Math.floor((remaining % 60_000) / 1000);
    let time = "";
    if (h > 0) time = `${h}h ${m}m`;
    else if (m > 0) time = `${m}m ${s}s`;
    else time = `${s}s`;
    return `\`${bar}\` ${time}`;
}
