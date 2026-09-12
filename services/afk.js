import { logger } from "../core/logger.js";

export class AfkService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async set(guildId, userId, reason) {
        return this.prisma.afk.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, reason },
            update: { reason, since: new Date() },
        });
    }

    async remove(guildId, userId) {
        const afk = await this.prisma.afk.findUnique({ where: { guildId_userId: { guildId, userId } } });
        if (afk) {
            await this.prisma.afk.delete({ where: { guildId_userId: { guildId, userId } } });
            return afk;
        }
        return null;
    }

    async get(guildId, userId) {
        return this.prisma.afk.findUnique({ where: { guildId_userId: { guildId, userId } } });
    }

    async handleMessage(message) {
        if (message.author.bot || !message.guild) return;

        // Check if the mentioned user is AFK
        for (const [id, user] of message.mentions.users) {
            const afk = await this.get(message.guild.id, id);
            if (afk) {
                const time = Math.floor((Date.now() - afk.since.getTime()) / 60_000);
                await message.reply(`${user.tag} is AFK${afk.reason ? `: ${afk.reason}` : ""} (${time}m ago)`).catch(() => {});
            }
        }

        // Remove AFK if the sender is AFK
        const senderAfk = await this.get(message.guild.id, message.author.id);
        if (senderAfk) {
            await this.remove(message.guild.id, message.author.id);
            await message.reply(`Welcome back! Removed your AFK.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5_000)).catch(() => {});
        }
    }
}
