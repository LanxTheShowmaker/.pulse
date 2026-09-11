import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, SelectMenuBuilder } from "@discordjs/builders";
import { MessageFlags, ButtonStyle } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class ReactionRoleService {
    prisma; client;
    constructor(prisma, client) { this.prisma = prisma; this.client = client; this.register(); }
    register() {
        this.client.components.set("rr:select", async (i) => {
            if (!i.isStringSelectMenu()) return;
            const panelId = i.customId.split(":")[2];
            const roleId = i.values[0];
            const member = i.member;
            try {
                if (member.roles.cache.has(roleId)) await member.roles.remove(roleId).catch(() => {});
                else await member.roles.add(roleId).catch(() => {});
                await i.reply({ content: `Toggled <@&${roleId}>`, flags: MessageFlags.Ephemeral }).catch(() => {});
            } catch (e) { logger.error("rr", "toggle failed", e); await i.reply({ content: "Failed.", flags: MessageFlags.Ephemeral }).catch(() => {}); }
        });
        this.client.components.set("rr:button", async (i) => {
            const roleId = i.customId.split(":")[2];
            const mem = i.member;
            try {
                if (mem.roles.cache.has(roleId)) await mem.roles.remove(roleId);
                else await mem.roles.add(roleId);
                await i.reply({ content: `Toggled <@&${roleId}>`, flags: MessageFlags.Ephemeral }).catch(() => {});
            } catch (e) { await i.reply({ content: "Failed.", flags: MessageFlags.Ephemeral }).catch(() => {}); }
        });
    }
    async createPanel(guild, channel, title, mappings) { // mappings [{emoji,roleId,label}]
        const embed = new EmbedBuilder().setColor(Theme.panel).setTitle(title).setDescription(mappings.map(m => `${m.emoji} — <@&${m.roleId}>`).join("\n")).setFooter({ text: `${Brand.name} • Self-roles` }).setTimestamp();
        const row = new ActionRowBuilder();
        if (mappings.length <= 5) {
            for (const m of mappings) row.addComponents(new ButtonBuilder().setCustomId(`rr:button:${m.roleId}`).setLabel(m.label ?? "Role").setStyle(ButtonStyle.Secondary).setEmoji(m.emoji));
            const msg = await channel.send({ embeds: [embed], components: [row] });
            for (const m of mappings) await this.prisma.reactionRole.create({ data: { guildId: guild.id, channelId: channel.id, messageId: msg.id, emoji: m.emoji, roleId: m.roleId } });
            return msg;
        } else {
            const menu = new SelectMenuBuilder().setCustomId(`rr:select:${Date.now()}`).setPlaceholder("Choose a role").addOptions(mappings.slice(0, 25).map(m => ({ label: m.label.slice(0, 100), value: m.roleId, emoji: m.emoji })));
            const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
            for (const m of mappings) await this.prisma.reactionRole.create({ data: { guildId: guild.id, channelId: channel.id, messageId: msg.id, emoji: m.emoji, roleId: m.roleId } });
            return msg;
        }
    }
}
