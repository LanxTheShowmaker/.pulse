import { eq, and } from "drizzle-orm";
import { reactionRole } from "../db/schema/index.js";
import { clean, one, uuid, affected } from "../db/util.js";
import { logger } from "../core/logger.js";

export class ReactionRoleService {
    constructor(db, client) {
        this.db = db;
        this.client = client;
    }

    async add(guildId, channelId, messageId, emoji, roleId) {
        const id = uuid();
        await this.db.insert(reactionRole).values(clean({ id, guildId, channelId, messageId, emoji, roleId }));
        return one(await this.db.select().from(reactionRole).where(eq(reactionRole.id, id)));
    }

    async remove(guildId, messageId, emoji) {
        const res = await this.db.delete(reactionRole)
            .where(and(eq(reactionRole.guildId, guildId), eq(reactionRole.messageId, messageId), eq(reactionRole.emoji, emoji)));
        return { count: affected(res) };
    }

    async getByMessage(messageId) {
        return this.db.select().from(reactionRole).where(eq(reactionRole.messageId, messageId));
    }

    async find(guildId, messageId, emoji) {
        return one(await this.db.select().from(reactionRole)
            .where(and(eq(reactionRole.guildId, guildId), eq(reactionRole.messageId, messageId), eq(reactionRole.emoji, emoji)))
            .limit(1));
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;
        const message = reaction.message;
        if (!message.guild) return;

        const emoji = reaction.emoji.id ?? reaction.emoji.name;
        const rr = await this.find(message.guild.id, message.id, emoji);

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
        const rr = await this.find(message.guild.id, message.id, emoji);

        if (!rr) return;

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (member) {
            await member.roles.remove(rr.roleId).catch(e => logger.warn("reactionRoles", "remove role failed", e.message));
        }
    }
}
