import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../ui/theme.js";
import { logger } from "../core/logger.js";

export class AppealService {
    constructor(prisma, client, logging) {
        this.prisma = prisma;
        this.client = client;
        this.logging = logging;
    }

    async submit(guildId, caseNumber, appellantId, reason) {
        const existing = await this.prisma.appeal.findFirst({
            where: { guildId, caseNumber, appellantId, status: "PENDING" },
        });
        if (existing) return { ok: false, error: "You already have a pending appeal for this case." };

        const appeal = await this.prisma.appeal.create({
            data: { guildId, caseNumber, appellantId, reason },
        });

        return { ok: true, appeal };
    }

    async approve(appealId, reviewerId, reviewerTag) {
        const appeal = await this.prisma.appeal.findUnique({ where: { id: appealId } });
        if (!appeal) return null;

        const updated = await this.prisma.appeal.update({
            where: { id: appealId },
            data: { status: "APPROVED", reviewerId, reviewerTag },
        });

        // Attempt to unban the appellant
        const guild = this.client.guilds.cache.get(appeal.guildId);
        if (guild) {
            await guild.members.unban(appeal.appellantId, `Appeal approved for case #${appeal.caseNumber}`).catch((e) => {
                logger.error("appeals", "unban failed", e.message);
            });

            // Notify in mod log channel
            const config = await this.client.services.settings?.get(appeal.guildId);
            if (config?.logChannelId) {
                const ch = guild.channels.cache.get(config.logChannelId);
                if (ch?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(Theme.success)
                        .setTitle("Appeal Approved")
                        .setDescription(`Case #${appeal.caseNumber} — <@${appeal.appellantId}>\nReason: ${appeal.reason}`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await ch.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }

        return updated;
    }

    async deny(appealId, reviewerId, reviewerTag) {
        const appeal = await this.prisma.appeal.findUnique({ where: { id: appealId } });
        if (!appeal) return null;

        const updated = await this.prisma.appeal.update({
            where: { id: appealId },
            data: { status: "DENIED", reviewerId, reviewerTag },
        });

        // Notify in mod log channel
        const guild = this.client.guilds.cache.get(appeal.guildId);
        if (guild) {
            const config = await this.client.services.settings?.get(appeal.guildId);
            if (config?.logChannelId) {
                const ch = guild.channels.cache.get(config.logChannelId);
                if (ch?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(Theme.danger)
                        .setTitle("Appeal Denied")
                        .setDescription(`Case #${appeal.caseNumber} — <@${appeal.appellantId}>\nReason: ${appeal.reason}`)
                        .setFooter({ text: Brand.footer })
                        .setTimestamp();
                    await ch.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }

        return updated;
    }

    async listPending(guildId) {
        return this.prisma.appeal.findMany({
            where: { guildId, status: "PENDING" },
            orderBy: { createdAt: "asc" },
        });
    }

    async getStats(guildId) {
        const pending = await this.prisma.appeal.count({ where: { guildId, status: "PENDING" } });
        const approved = await this.prisma.appeal.count({ where: { guildId, status: "APPROVED" } });
        const denied = await this.prisma.appeal.count({ where: { guildId, status: "DENIED" } });
        return { pending, approved, denied, total: pending + approved + denied };
    }
}
