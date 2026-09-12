import { logger } from "../core/logger.js";

export class ReactionRoleService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async add(guildId, channelId, messageId, emoji, roleId) {
        return this.prisma.reactionRole.create({
            data: { guildId, channelId, messageId, emoji, roleId },
        });
    }

    async remove(guildId, messageId, emoji) {
        return this.prisma.reactionRole.deleteMany({
            where: { guildId, messageId, emoji },
        });
    }

    async getByMessage(messageId) {
        return this.prisma.reactionRole.findMany({ where: { messageId } });
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;
        const message = reaction.message;
        if (!message.guild) return;

        const emoji = reaction.emoji.id ?? reaction.emoji.name;
        const rr = await this.prisma.reactionRole.findFirst({
            where: { guildId: message.guild.id, messageId: message.id, emoji },
        });

        if (!rr) return;

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (member) {
            await member.roles.add(rr.roleId).catch(e => logger.warn("reactionRoles", "add role failed", e.message));
        }
    }

    async handleReactionRemove(reaction, user) {
        if (user.bot) return;
        const message = reaction.message;
        if (!message.guild) return;

        const emoji = reaction.emoji.id ?? reaction.emoji.name;
        const rr = await this.prisma.reactionRole.findFirst({
            where: { guildId: message.guild.id, messageId: message.id, emoji },
        });

        if (!rr) return;

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (member) {
            await member.roles.remove(rr.roleId).catch(e => logger.warn("reactionRoles", "remove role failed", e.message));
        }
    }
}
