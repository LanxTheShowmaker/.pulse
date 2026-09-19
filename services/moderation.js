import { EmbedBuilder } from "@discordjs/builders";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { case_ as caseTable, caseNote } from "../db/schema/index.js";
import { one } from "../db/util.js";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class ModerationService {
    constructor(db, cases, logging, audit, client) {
        this.db = db;
        this.cases = cases;
        this.logging = logging;
        this.audit = audit;
        this.client = client;
    }

    async warn(guildId, moderator, target, reason) {
        const case_ = await this.cases.create(guildId, {
            targetId: target.id, targetTag: target.tag ?? target.user?.tag ?? "unknown",
            moderatorId: moderator.id, moderatorTag: moderator.tag ?? moderator.user?.tag ?? "unknown",
            action: "warn", reason,
        });

        await this.audit.log(guildId, moderator.id, target.id, "warn", "moderation", { caseNumber: case_.caseNumber, reason });
        this.client.services.achievements?.increment(guildId, moderator.id, "modActions").catch(() => {});

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

        await this.audit.log(guildId, moderator.id, target.id, "ban", "moderation", { caseNumber: case_.caseNumber, reason, duration: duration?.text });

        if (member) {
            await member.ban({ deleteMessageSeconds: 0, reason: `Case #${case_.caseNumber}: ${reason ?? "No reason provided"}` }).catch(e => {
                logger.error("moderation", "ban failed", e.message);
                return null;
            });
        }

        const embed = this.buildModEmbed("Banned", target, moderator, reason, case_.caseNumber, duration?.text);
        await this.logging.logMod(guildId, embed);
        this.client.services.achievements?.increment(guildId, moderator.id, "modActions").catch(() => {});

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

        await this.audit.log(guildId, moderator.id, target.id, "kick", "moderation", { caseNumber: case_.caseNumber, reason });

        if (member) {
            await member.send({ content: `You have been kicked from **${member.guild.name}**.\nReason: ${reason ?? "No reason provided"}` }).catch(() => {});
            await member.kick(`Case #${case_.caseNumber}: ${reason ?? "No reason provided"}`).catch(e => {
                logger.error("moderation", "kick failed", e.message);
                return null;
            });
        }

        const embed = this.buildModEmbed("Kicked", target, moderator, reason, case_.caseNumber);
        await this.logging.logMod(guildId, embed);
        this.client.services.achievements?.increment(guildId, moderator.id, "modActions").catch(() => {});

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

        await this.audit.log(guildId, moderator.id, target.id, "timeout", "moderation", { caseNumber: case_.caseNumber, reason, duration: duration?.text });

        if (member) {
            const until = duration?.ms ? new Date(Date.now() + duration.ms) : null;
            await member.timeout(duration?.ms ?? 60_000, `Case #${case_.caseNumber}: ${reason ?? "No reason provided"}`).catch(e => {
                logger.error("moderation", "timeout failed", e.message);
                return null;
            });
        }

        const embed = this.buildModEmbed("Timed out", target, moderator, reason, case_.caseNumber, duration?.text);
        await this.logging.logMod(guildId, embed);
        this.client.services.achievements?.increment(guildId, moderator.id, "modActions").catch(() => {});

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

    // ─── API BOUNDARY: Moderation API ────────────────────────

    async getRecentCasesApi(guildId, limit = 25) {
        return this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            resolvedById: caseTable.resolvedById,
            resolvedByTag: caseTable.resolvedByTag,
            resolvedAt: caseTable.resolvedAt,
            createdAt: caseTable.createdAt,
        }).from(caseTable).where(eq(caseTable.guildId, guildId))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async getCaseApi(guildId, caseNumber) {
        return one(await this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            moderatorId: caseTable.moderatorId,
            moderatorTag: caseTable.moderatorTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            resolvedById: caseTable.resolvedById,
            resolvedByTag: caseTable.resolvedByTag,
            resolvedAt: caseTable.resolvedAt,
            metadata: caseTable.metadata,
            createdAt: caseTable.createdAt,
        }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.caseNumber, caseNumber))).limit(1));
    }

    async getCasesByTargetApi(guildId, targetId, limit = 25) {
        return this.db.select({
            id: caseTable.id,
            caseNumber: caseTable.caseNumber,
            targetId: caseTable.targetId,
            targetTag: caseTable.targetTag,
            action: caseTable.action,
            reason: caseTable.reason,
            duration: caseTable.duration,
            durationMs: caseTable.durationMs,
            resolved: caseTable.resolved,
            createdAt: caseTable.createdAt,
        }).from(caseTable)
            .where(and(eq(caseTable.guildId, guildId), eq(caseTable.targetId, targetId)))
            .orderBy(desc(caseTable.caseNumber)).limit(limit);
    }

    async getCaseNotesApi(guildId, targetId, limit = 25) {
        return this.db.select({
            id: caseNote.id,
            authorId: caseNote.authorId,
            authorTag: caseNote.authorTag,
            content: caseNote.content,
            createdAt: caseNote.createdAt,
        }).from(caseNote)
            .where(and(eq(caseNote.guildId, guildId), eq(caseNote.targetId, targetId)))
            .orderBy(desc(caseNote.createdAt)).limit(limit);
    }

    async getCaseStatsApi(guildId) {
        const totalRows = await this.db.select({ n: count() }).from(caseTable).where(eq(caseTable.guildId, guildId));
        const byAction = await this.db.select({ action: caseTable.action, n: count() }).from(caseTable)
            .where(eq(caseTable.guildId, guildId)).groupBy(caseTable.action);
        const byTarget = await this.db.select({ targetId: caseTable.targetId, n: count() }).from(caseTable)
            .where(and(
                eq(caseTable.guildId, guildId),
                // warn/ban/kick/timeout only, mirroring the previous filter
                sql`${caseTable.action} IN ('warn','ban','kick','timeout')`,
            )).groupBy(caseTable.targetId);
        return {
            total: Number(totalRows[0]?.n ?? 0),
            byAction: Object.fromEntries(byAction.map(r => [r.action, Number(r.n)])),
            byTargetCount: Object.fromEntries(byTarget.map(r => [r.targetId, Number(r.n)])),
        };
    }
}
