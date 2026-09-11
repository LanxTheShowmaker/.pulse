import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class ModerationService {
    constructor(prisma, cases, logging, client) {
        this.prisma = prisma;
        this.cases = cases;
        this.logging = logging;
        this.client = client;
    }

    async warn(guildId, moderator, target, reason) {
        const case_ = await this.cases.create(guildId, {
            targetId: target.id, targetTag: target.tag ?? target.user?.tag ?? "unknown",
            moderatorId: moderator.id, moderatorTag: moderator.tag ?? moderator.user?.tag ?? "unknown",
            action: "warn", reason,
        });

        const embed = this.buildModEmbed("Warned", target, moderator, reason, case_.caseNumber);
        await this.logging.logMod(guildId, embed);

        return { case: case_ };
    }

    async ban(guildId, moderator, target, reason, duration) {
        const member = await this.client.guilds.cache.get(guildId)?.members.fetch(target.id).catch(() => null);

        const case_ = await this.cases.create(guildId, {
            targetId: target.id, targetTag: target.tag ?? target.user?.tag ?? "unknown",
            moderatorId: moderator.id, moderatorTag: moderator.tag ?? moderator.user?.tag ?? "unknown",
            action: "ban", reason,
            duration: duration?.text ?? null,
            durationMs: duration?.ms ?? null,
        });

        if (member) {
            await member.ban({ deleteMessageSeconds: 0, reason: `Case #${case_.caseNumber}: ${reason ?? "No reason provided"}` }).catch(e => {
                logger.error("moderation", "ban failed", e.message);
                return null;
            });
        }

        const embed = this.buildModEmbed("Banned", target, moderator, reason, case_.caseNumber, duration?.text);
        await this.logging.logMod(guildId, embed);

        // DM the target
        if (member) {
            await member.send({ content: `You have been banned from **${member.guild.name}**.\nReason: ${reason ?? "No reason provided"}${duration?.text ? `\nDuration: ${duration.text}` : ""}` }).catch(() => {});
        }

        return { case: case_ };
    }

    async kick(guildId, moderator, target, reason) {
        const member = await this.client.guilds.cache.get(guildId)?.members.fetch(target.id).catch(() => null);

        const case_ = await this.cases.create(guildId, {
            targetId: target.id, targetTag: target.tag ?? target.user?.tag ?? "unknown",
            moderatorId: moderator.id, moderatorTag: moderator.tag ?? moderator.user?.tag ?? "unknown",
            action: "kick", reason,
        });

        // DM before kick
        if (member) {
            await member.send({ content: `You have been kicked from **${member.guild.name}**.\nReason: ${reason ?? "No reason provided"}` }).catch(() => {});
            await member.kick(`Case #${case_.caseNumber}: ${reason ?? "No reason provided"}`).catch(e => {
                logger.error("moderation", "kick failed", e.message);
                return null;
            });
        }

        const embed = this.buildModEmbed("Kicked", target, moderator, reason, case_.caseNumber);
        await this.logging.logMod(guildId, embed);

        return { case: case_ };
    }

    async timeout(guildId, moderator, target, reason, duration) {
        const member = await this.client.guilds.cache.get(guildId)?.members.fetch(target.id).catch(() => null);

        const case_ = await this.cases.create(guildId, {
            targetId: target.id, targetTag: target.tag ?? target.user?.tag ?? "unknown",
            moderatorId: moderator.id, moderatorTag: moderator.tag ?? moderator.user?.tag ?? "unknown",
            action: "timeout", reason,
            duration: duration?.text ?? null,
            durationMs: duration?.ms ?? null,
        });

        if (member) {
            const until = duration?.ms ? new Date(Date.now() + duration.ms) : null;
            await member.timeout(duration?.ms ?? 60_000, `Case #${case_.caseNumber}: ${reason ?? "No reason provided"}`).catch(e => {
                logger.error("moderation", "timeout failed", e.message);
                return null;
            });
        }

        const embed = this.buildModEmbed("Timed out", target, moderator, reason, case_.caseNumber, duration?.text);
        await this.logging.logMod(guildId, embed);

        if (member) {
            await member.send({ content: `You have been timed out in **${member.guild.name}**.\nReason: ${reason ?? "No reason provided"}\nDuration: ${duration?.text ?? "Unknown"}` }).catch(() => {});
        }

        return { case: case_ };
    }

    buildModEmbed(action, target, moderator, reason, caseNumber, duration) {
        const color = action === "Banned" ? Theme.danger : action === "Timed out" ? Theme.warn : Theme.accent;
        return new EmbedBuilder()
            .setColor(color)
            .setTitle(`${action}`)
            .addFields(
                { name: "Target", value: `<@${target.id}> (${target.tag ?? target.user?.tag ?? "unknown"})`, inline: true },
                { name: "Moderator", value: `<@${moderator.id}>`, inline: true },
                { name: "Case", value: `#${caseNumber}`, inline: true },
            )
            .setDescription(reason ?? "No reason provided")
            .setFooter({ text: Brand.footer })
            .setTimestamp();
    }
}
