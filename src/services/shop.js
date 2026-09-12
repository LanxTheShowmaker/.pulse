import { logger } from "../core/logger.js";

export class ShopService {
    constructor(prisma, client, economy) {
        this.prisma = prisma;
        this.client = client;
        this.economy = economy;
    }

    async addItem(guildId, name, description, price, roleId, emoji, stock) {
        return this.prisma.shopItem.create({
            data: { guildId, name, description, price, roleId, emoji, stock },
        });
    }

    async removeItem(guildId, name) {
        const item = await this.prisma.shopItem.findUnique({ where: { guildId_name: { guildId, name } } });
        if (!item) return null;
        await this.prisma.shopItem.delete({ where: { id: item.id } });
        return item;
    }

    async getItems(guildId) {
        return this.prisma.shopItem.findMany({ where: { guildId }, orderBy: { price: "asc" } });
    }

    async buyItem(guildId, userId, name) {
        const item = await this.prisma.shopItem.findUnique({ where: { guildId_name: { guildId, name } } });
        if (!item) return { ok: false, error: "Item not found" };
        if (item.stock !== null && item.stock <= 0) return { ok: false, error: "Out of stock" };

        const balance = await this.economy.getBalance(guildId, userId);
        if (balance.total < item.price) return { ok: false, error: `Need ${item.price} coins (have ${balance.total})` };

        await this.economy.addCoins(guildId, userId, -item.price, "shop_buy", { item: item.name });

        if (item.stock !== null) {
            await this.prisma.shopItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
        }

        await this.prisma.shopInventory.upsert({
            where: { guildId_userId_itemId: { guildId, userId, itemId: item.id } },
            create: { guildId, userId, itemId: item.id, quantity: 1 },
            update: { quantity: { increment: 1 } },
        });

        // Grant role if applicable
        if (item.roleId) {
            const guild = this.client.guilds.cache.get(guildId);
            const member = await guild?.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(item.roleId).catch(() => {});
        }

        return { ok: true, item };
    }

    async getInventory(guildId, userId) {
        return this.prisma.shopInventory.findMany({
            where: { guildId, userId },
        });
    }
}
