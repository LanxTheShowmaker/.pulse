import { EmbedBuilder } from "@discordjs/builders";
import { eq, and, asc, count } from "drizzle-orm";
import { appeal } from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class AppealService {
    constructor(db, client, logging) {
        this.db = db;
        this.client = client;
        this.logging = logging;
    }

    async submit(guildId, caseNumber, appellantId, reason) {
        const existing = one(await this.db.select().from(appeal)
            .where(and(eq(appeal.guildId, guildId), eq(appeal.caseNumber, caseNumber), eq(appeal.appellantId, appellantId), eq(appeal.status, "PENDING")))
            .limit(1));
        if (existing) return { ok: false, error: "You already have a pending appeal for this case." };

        const id = uuid();
        await this.db.insert(appeal).values(clean({ id, guildId, caseNumber, appellantId, reason }));
        const row = one(await this.db.select().from(appeal).where(eq(appeal.id, id)));

        return { ok: true, appeal: row };
    }

    async approve(appealId, reviewerId, reviewerTag) {
        const row = one(await this.db.select().from(appeal).where(eq(appeal.id, appealId)).limit(1));
        if (!row) return null;

        await this.db.update(appeal)
            .set({ status: "APPROVED", reviewerId, reviewerTag })
            .where(eq(appeal.id, appealId));
        const updated = one(await this.db.select().from(appeal).where(eq(appeal.id, appealId)).limit(1));

        // Attempt to unban the appellant
        const guild = this.client.guilds.cache.get(updated.guildId);
        if (guild) {
            await guild.members.unban(updated.appellantId, `Appeal approved for case #${updated.caseNumber}`).catch((e) => {
                logger.error("appeals", "unban failed", e.message);
            });

            // Notify in mod log channel
            const config = await this.client.services.settings?.get(updated.guildId);
            if (config?.logChannelId) {
                const ch = guild.channels.cache.get(config.logChannelId);
                if (ch?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(Theme.success)
                        .setTitle("Appeal Approved")
                        .setDescription(`Case #${updated.caseNumber} — <@${updated.appellantId}>\nReason: ${updated.reason}`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await ch.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }

        return updated;
    }

    async deny(appealId, reviewerId, reviewerTag) {
        const row = one(await this.db.select().from(appeal).where(eq(appeal.id, appealId)).limit(1));
        if (!row) return null;

        await this.db.update(appeal)
            .set({ status: "DENIED", reviewerId, reviewerTag })
            .where(eq(appeal.id, appealId));
        const updated = one(await this.db.select().from(appeal).where(eq(appeal.id, appealId)).limit(1));

        // Notify in mod log channel
        const guild = this.client.guilds.cache.get(updated.guildId);
        if (guild) {
            const config = await this.client.services.settings?.get(updated.guildId);
            if (config?.logChannelId) {
                const ch = guild.channels.cache.get(config.logChannelId);
                if (ch?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(Theme.danger)
                        .setTitle("Appeal Denied")
                        .setDescription(`Case #${updated.caseNumber} — <@${updated.appellantId}>\nReason: ${updated.reason}`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await ch.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }

        return updated;
    }

    async listPending(guildId) {
        return this.db.select().from(appeal)
            .where(and(eq(appeal.guildId, guildId), eq(appeal.status, "PENDING")))
            .orderBy(asc(appeal.createdAt));
    }

    async getStats(guildId) {
        const pending = await this.db.select({ n: count() }).from(appeal)
            .where(and(eq(appeal.guildId, guildId), eq(appeal.status, "PENDING")));
        const approved = await this.db.select({ n: count() }).from(appeal)
            .where(and(eq(appeal.guildId, guildId), eq(appeal.status, "APPROVED")));
        const denied = await this.db.select({ n: count() }).from(appeal)
            .where(and(eq(appeal.guildId, guildId), eq(appeal.status, "DENIED")));
        const p = Number(pending[0]?.n ?? 0), a = Number(approved[0]?.n ?? 0), d = Number(denied[0]?.n ?? 0);
        return { pending: p, approved: a, denied: d, total: p + a + d };
    }
}
