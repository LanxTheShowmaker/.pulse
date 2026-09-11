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
        return ticket;
    }

    async close(channelId, closedById) {
        const ticket = await this.prisma.ticket.findUnique({ where: { channelId } });
        if (!ticket) return null;

        await this.prisma.ticket.update({
            where: { channelId },
            data: { status: "CLOSED", closedById, closedAt: new Date() },
        });

        const guild = this.client.guilds.cache.get(ticket.guildId);
        if (guild) {
            const ch = guild.channels.cache.get(channelId);
            if (ch) {
                await ch.send({ embeds: [new EmbedBuilder().setColor(Theme.muted).setTitle("Ticket Closed").setDescription(`Closed by <@${closedById}>. Channel will be deleted shortly.`).setFooter({ text: Brand.footer }).setTimestamp()] }).catch(() => {});
                setTimeout(() => ch.delete().catch(() => {}), 5_000);
            }
        }

        return ticket;
    }

    async claim(ticketId, userId) {
        return this.prisma.ticket.update({
            where: { id: ticketId },
            data: { claimedById: userId, status: "CLAIMED" },
        });
    }

    async getStats(guildId) {
        const open = await this.prisma.ticket.count({ where: { guildId, status: { in: ["OPEN", "CLAIMED"] } } });
        const closed = await this.prisma.ticket.count({ where: { guildId, status: "CLOSED" } });
        return { open, closed, total: open + closed };
    }

    async listOpen(guildId, limit = 15) {
        return this.prisma.ticket.findMany({
            where: { guildId, status: { in: ["OPEN", "CLAIMED"] } },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }
}
