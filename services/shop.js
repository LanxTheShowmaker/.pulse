import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { shopItem, shopInventory } from "../db/schema/index.js";
import { clean, one, uuid } from "../db/util.js";
import { logger } from "../core/logger.js";

export class ShopService {
    constructor(db, client, economy) {
        this.db = db;
        this.client = client;
        this.economy = economy;
    }

    async addItem(guildId, name, description, price, roleId, emoji, stock) {
        const id = uuid();
        await this.db.insert(shopItem).values(clean({ id, guildId, name, description, price, roleId, emoji, stock }));
        return one(await this.db.select().from(shopItem).where(eq(shopItem.id, id)));
    }

    async removeItem(guildId, name) {
        const item = one(await this.db.select().from(shopItem)
            .where(and(eq(shopItem.guildId, guildId), eq(shopItem.name, name))).limit(1));
        if (!item) return null;
        await this.db.delete(shopItem).where(eq(shopItem.id, item.id));
        return item;
    }

    async getItems(guildId) {
        return this.db.select().from(shopItem)
            .where(eq(shopItem.guildId, guildId)).orderBy(asc(shopItem.price));
    }

    async buyItem(guildId, userId, name) {
        const item = one(await this.db.select().from(shopItem)
            .where(and(eq(shopItem.guildId, guildId), eq(shopItem.name, name))).limit(1));
        if (!item) return { ok: false, error: "Item not found" };
        if (item.stock !== null && item.stock <= 0) return { ok: false, error: "Out of stock" };

        const balance = await this.economy.getBalance(guildId, userId);
        if (balance.total < item.price) return { ok: false, error: `Need ${item.price} coins (have ${balance.total})` };

        await this.economy.addCoins(guildId, userId, -item.price, "shop_buy", { item: item.name });

        if (item.stock !== null) {
            await this.db.update(shopItem).set({ stock: sql`${shopItem.stock} - 1` }).where(eq(shopItem.id, item.id));
        }

        await this.db.insert(shopInventory).values({ guildId, userId, itemId: item.id, quantity: 1 })
            .onDuplicateKeyUpdate({ set: { quantity: sql`${shopInventory.quantity} + 1` } });

        // Grant role if applicable
        if (item.roleId) {
            const guild = this.client.guilds.cache.get(guildId);
            const member = await guild?.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(item.roleId).catch(() => {});
        }

        return { ok: true, item };
    }

    async getInventory(guildId, userId) {
        return this.db.select().from(shopInventory)
            .where(and(eq(shopInventory.guildId, guildId), eq(shopInventory.userId, userId)));
    }

    async getItemsByIds(itemIds) {
        if (!itemIds.length) return [];
        return this.db.select().from(shopItem).where(inArray(shopItem.id, itemIds));
    }

    async updateItem(id, updates) {
        await this.db.update(shopItem).set(clean(updates)).where(eq(shopItem.id, id));
        return one(await this.db.select().from(shopItem).where(eq(shopItem.id, id)).limit(1));
    }

    async grantItem(guildId, userId, itemId, quantity) {
        await this.db.insert(shopInventory).values({ guildId, userId, itemId, quantity })
            .onDuplicateKeyUpdate({ set: { quantity: sql`${shopInventory.quantity} + ${quantity}` } });
    }

    async revokeItem(guildId, userId, itemId) {
        const inv = one(await this.db.select().from(shopInventory)
            .where(and(eq(shopInventory.guildId, guildId), eq(shopInventory.userId, userId), eq(shopInventory.itemId, itemId)))
            .limit(1));
        if (!inv) return null;
        await this.db.delete(shopInventory).where(eq(shopInventory.id, inv.id));
        return inv;
    }
}
