import { EmbedBuilder } from "@discordjs/builders";
import { ChannelType, PermissionFlagsBits, MessageFlags } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export class TicketService {
    constructor(prisma, client, settings, logging) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
        this.logging = logging;
    }

    async open(guild, channel, opener, type, panelType) {
        const ticket = await this.prisma.ticket.create({
            data: {
                guildId: guild.id,
                channelId: channel.id,
                openerId: opener.id,
                typeId: type?.id ?? null,
                panelType: panelType ?? null,
                status: "OPEN",
            },
        });

        // Set permissions
        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false });
        await channel.permissionOverwrites.edit(opener.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

        if (type?.staffRoleIds) {
            const staffIds = JSON.parse(type.staffRoleIds || "[]");
            for (const id of staffIds) {
                await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
            }
        }

        // Send welcome message
        const welcome = type?.welcomeMessage ?? `Ticket opened. A staff member will be with you shortly.`;
        const embed = new EmbedBuilder()
            .setColor(Theme.ticket)
            .setTitle(`${type?.displayName ?? "Support Ticket"}`)
            .setDescription(welcome)
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});

        // Achievement: ticket opened
        this.client.services.achievements?.increment(guild.id, opener.id, "ticketsOpened").catch(() => {});

        return ticket;
    }

    async buildTranscript(channel) {
        const messages = [];
        let lastId;
        while (true) {
            const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
            if (!batch?.size) break;
            for (const msg of batch.values()) {
                messages.push({
                    author: msg.author.tag,
                    authorId: msg.author.id,
                    content: msg.content,
                    timestamp: msg.createdAt.toISOString(),
                    attachments: msg.attachments.map(a => ({ name: a.name, url: a.url })),
                });
            }
            lastId = batch.last()?.id;
            if (batch.size < 100) break;
        }
        messages.reverse();
        return JSON.stringify(messages);
    }

    async close(channelId, closedById) {
        const ticket = await this.prisma.ticket.findUnique({ where: { channelId } });
        if (!ticket) return null;

        // Build transcript before deletion
        const guild = this.client.guilds.cache.get(ticket.guildId);
        let transcript = null;
        if (guild) {
            const ch = guild.channels.cache.get(channelId);
            if (ch?.isTextBased()) {
                transcript = await this.buildTranscript(ch).catch(() => null);
            }
        }

        await this.prisma.ticket.update({
            where: { channelId },
            data: { status: "CLOSED", closedById, closedAt: new Date(), transcript },
        });

        if (guild) {
            const ch = guild.channels.cache.get(channelId);
            if (ch) {
                // Send rating prompt before deleting
                const ratingEmbed = new EmbedBuilder()
                    .setColor(Theme.info)
                    .setTitle("Rate this ticket")
                    .setDescription("How was your support experience?")
                    .setFooter({ text: Brand.footer });

                const buttons = [];
                for (let s = 1; s <= 5; s++) {
                    buttons.push({ type: 2, style: 2, label: `${"⭐".repeat(s)}`, customId: `ticketrate:${ticket.id}:${s}` });
                }

                await ch.send({ embeds: [ratingEmbed], components: [{ type: 1, components: buttons }] }).catch(() => {});
                await ch.send({ embeds: [new EmbedBuilder().setColor(Theme.muted).setTitle("Ticket Closed").setDescription(`Closed by <@${closedById}>. Channel will be deleted shortly.`).setFooter({ text: Brand.footer }).setTimestamp()] }).catch(() => {});
                setTimeout(() => ch.delete().catch(() => {}), 15_000);
            }
        }

        return { ...ticket, transcript };
    }

    async rate(ticketId, channelId, guildId, raterId, rating, feedback) {
        const existing = await this.prisma.ticketRating.findUnique({
            where: { guildId_channelId_raterId: { guildId, channelId, raterId } },
        });

        if (existing) {
            return this.prisma.ticketRating.update({
                where: { id: existing.id },
                data: { rating, feedback: feedback || null },
            });
        }

        return this.prisma.ticketRating.create({
            data: { guildId, channelId, raterId, rating, feedback: feedback || null },
        });
    }

    async getStats(guildId) {
        const open = await this.prisma.ticket.count({ where: { guildId, status: { in: ["OPEN", "CLAIMED"] } } });
        const closed = await this.prisma.ticket.count({ where: { guildId, status: "CLOSED" } });
        const avg = await this.prisma.ticketRating.aggregate({
            where: { guildId },
            _avg: { rating: true },
            _count: { rating: true },
        });
        return { open, closed, total: open + closed, avgRating: avg._avg.rating, ratedCount: avg._count.rating };
    }

    async listOpen(guildId, limit = 15) {
        return this.prisma.ticket.findMany({
            where: { guildId, status: { in: ["OPEN", "CLAIMED"] } },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }
}
