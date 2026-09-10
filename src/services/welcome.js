import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class WelcomeService {
    prisma; client; settings;
    constructor(prisma, client, settings) { this.prisma = prisma; this.client = client; this.settings = settings; this.register(); }
    register() {
        this.client.components.set("welcome:verify", async (i) => {
            const roleId = i.customId.split(":")[2];
            if (!roleId) return i.reply({ content: "Verification role not set.", flags: MessageFlags.Ephemeral }).catch(() => {});
            const member = i.member;
            try { await member.roles.add(roleId).catch(() => {}); await i.reply({ content: `Verified — added <@&${roleId}>`, flags: MessageFlags.Ephemeral }).catch(() => {}); } catch (e) { logger.error("welcome", "verify failed", e); await i.reply({ content: "Could not verify.", flags: MessageFlags.Ephemeral }).catch(() => {}); }
        });
    }
    async handleJoin(member) {
        const guild = member.guild;
        const cfg = await this.settings.get(guild.id).catch(() => null);
        if (!cfg || cfg.modules?.welcome === false) return;
        const ch = cfg.welcomeChannelId ? guild.channels.cache.get(cfg.welcomeChannelId) ?? await guild.channels.fetch(cfg.welcomeChannelId).catch(() => null) : null;
        if (!ch || !ch.isTextBased()) return;
        // Autorole from cfg.ignoredRoleIds abuse? Use modules.autoroleIds if stored
        const autoroles = (() => { try { const m = cfg.modules?.autoroleIds; return Array.isArray(m) ? m : []; } catch { return [] } })();
        for (const rid of autoroles) await member.roles.add(rid).catch(() => {});
        const embed = new EmbedBuilder().setColor(Theme.accent).setTitle(`Welcome — ${guild.name}`).setDescription(`Hey <@${member.id}> — welcome to **${guild.name}**!\n*Read regulations, pick a panel, and enjoy.*`).setThumbnail(member.user.displayAvatarURL({ size: 128 })).setFooter({ text: Brand.name }).setTimestamp();
        const row = new ActionRowBuilder();
        // Verification button if verifyRole set in modules.verifyRoleId
        const verifyRole = cfg.modules?.verifyRoleId;
        if (verifyRole) row.addComponents(new ButtonBuilder().setCustomId(`welcome:verify:${verifyRole}`).setLabel("Verify").setStyle(ButtonStyle.Success).setEmoji("✅"));
        try { await ch.send({ content: `<@${member.id}>`, embeds: [embed], components: row.components.length ? [row] : [] }); } catch (e) { logger.error("welcome", "send failed", e); }
    }
    async handleLeave(member) {
        const cfg = await this.settings.get(member.guild.id).catch(() => null);
        const ch = cfg?.goodbyeChannelId ? member.guild.channels.cache.get(cfg.goodbyeChannelId) ?? await member.guild.channels.fetch(cfg.goodbyeChannelId).catch(() => null) : null;
        if (!ch || !ch.isTextBased()) return;
        const embed = new EmbedBuilder().setColor(Theme.muted).setTitle("Goodbye").setDescription(`**${member.user.tag}** left — we'll miss you.`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
        await ch.send({ embeds: [embed] }).catch(() => {});
    }
}