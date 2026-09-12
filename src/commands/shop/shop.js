import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { success, error, panel } from "../../design/embeds.js";

export default {
    category: "shop",
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("Shop system")
        .addSubcommand(sub => sub.setName("view").setDescription("Browse shop items"))
        .addSubcommand(sub => sub
            .setName("buy")
            .setDescription("Buy an item")
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("inventory").setDescription("View your inventory"))
        // Admin
        .addSubcommand(sub => sub
            .setName("add")
            .setDescription("Add a shop item")
            .addStringOption(o => o.setName("name").setDescription("Item name").setRequired(true))
            .addIntegerOption(o => o.setName("price").setDescription("Price in coins").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Description").setRequired(false))
            .addRoleOption(o => o.setName("role").setDescription("Role granted on purchase").setRequired(false))
            .addIntegerOption(o => o.setName("stock").setDescription("Stock (-1 = unlimited)").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("remove")
            .setDescription("Remove a shop item")
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("edit")
            .setDescription("Edit a shop item")
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
            .addIntegerOption(o => o.setName("price").setDescription("New price").setRequired(false))
            .addStringOption(o => o.setName("description").setDescription("New description").setRequired(false))
            .addRoleOption(o => o.setName("role").setDescription("New role").setRequired(false))
            .addIntegerOption(o => o.setName("stock").setDescription("New stock").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("restock")
            .setDescription("Restock an item")
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount to add").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("grant")
            .setDescription("Grant an item to a user")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
            .addIntegerOption(o => o.setName("quantity").setDescription("Quantity").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("revoke")
            .setDescription("Revoke an item from a user")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("list-items").setDescription("List all items with stock info")),

    async execute(interaction) {
        const { shop } = interaction.client.services;
        const sub = interaction.options.getSubcommand();
        const isAdmin = ["add", "remove", "edit", "restock", "grant", "revoke", "list-items"].includes(sub);

        if (isAdmin) {
            const isMod = await interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            if (!isMod) return interaction.reply({ embeds: [error("Denied", "You need Manage Server permission.")], flags: MessageFlags.Ephemeral });
        }

        switch (sub) {
            case "view":      return this.handleView(interaction, shop);
            case "buy":       return this.handleBuy(interaction, shop);
            case "inventory": return this.handleInventory(interaction, shop);
            case "add":       return this.handleAdd(interaction, shop);
            case "remove":    return this.handleRemove(interaction, shop);
            case "edit":      return this.handleEdit(interaction, shop);
            case "restock":   return this.handleRestock(interaction, shop);
            case "grant":     return this.handleGrant(interaction, shop);
            case "revoke":    return this.handleRevoke(interaction, shop);
            case "list-items": return this.handleListItems(interaction, shop);
        }
    },

    async handleView(interaction, shop) {
        const items = await shop.getItems(interaction.guild.id);
        if (!items.length) return interaction.reply({ embeds: [panel("Shop", "No items available yet.")] });

        const lines = items.map(i => {
            const stock = i.stock !== null ? `${i.stock} left` : "∞";
            const role = i.roleId ? `\n<@&${i.roleId}>` : "";
            return `**${i.emoji ?? "•"} ${i.name}** — ${i.price} coins (${stock})${i.description ? `\n${i.description}` : ""}${role}`;
        });

        await interaction.reply({ embeds: [panel(`Shop — ${items.length} items`, lines.join("\n\n"))] });
    },

    async handleBuy(interaction, shop) {
        const name = interaction.options.getString("item");
        const result = await shop.buyItem(interaction.guild.id, interaction.user.id, name);
        if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
        await interaction.reply({
            embeds: [success("Purchased", `Bought **${result.item.name}** for ${result.item.price} coins.`)],
        });
    },

    async handleInventory(interaction, shop) {
        const inv = await shop.getInventory(interaction.guild.id, interaction.user.id);
        if (!inv.length) return interaction.reply({ embeds: [panel("Inventory", "Nothing here yet. Buy something from the shop!")], flags: MessageFlags.Ephemeral });

        const lines = inv.map(i => `• **${i.itemId}** x${i.quantity}`);
        await interaction.reply({ embeds: [panel(`${interaction.user.username}'s Inventory`, lines.join("\n"))], flags: MessageFlags.Ephemeral });
    },

    async handleAdd(interaction, shop) {
        const name = interaction.options.getString("name");
        const price = interaction.options.getInteger("price");
        const description = interaction.options.getString("description");
        const role = interaction.options.getRole("role");
        const stock = interaction.options.getInteger("stock");

        const item = await shop.addItem(interaction.guild.id, name, description, price, role?.id, null, stock === -1 ? null : stock);
        const stockText = stock === -1 || stock === null ? "∞" : stock;
        await interaction.reply({
            embeds: [success("Item Added", `**${name}**\nPrice: ${price} coins\nStock: ${stockText}${role ? `\nRole: <@&${role.id}>` : ""}`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleRemove(interaction, shop) {
        const name = interaction.options.getString("item");
        const removed = await shop.removeItem(interaction.guild.id, name);
        if (!removed) return interaction.reply({ embeds: [error("Not Found", "Item not found.")], flags: MessageFlags.Ephemeral });
        await interaction.reply({ embeds: [success("Removed", `**${removed.name}** deleted from shop.`)], flags: MessageFlags.Ephemeral });
    },

    async handleEdit(interaction, shop) {
        const name = interaction.options.getString("item");
        const price = interaction.options.getInteger("price");
        const description = interaction.options.getString("description");
        const role = interaction.options.getRole("role");
        const stock = interaction.options.getInteger("stock");

        const items = await shop.getItems(interaction.guild.id);
        const item = items.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (!item) return interaction.reply({ embeds: [error("Not Found", "Item not found.")], flags: MessageFlags.Ephemeral });

        const updates = {};
        if (price !== null) updates.price = price;
        if (description !== null) updates.description = description;
        if (role !== null) updates.roleId = role.id;
        if (stock !== null) updates.stock = stock === -1 ? null : stock;

        await shop.prisma.shopItem.update({ where: { id: item.id }, data: updates });
        await interaction.reply({
            embeds: [success("Item Updated", `**${name}** updated.${price ? ` Price: ${price}` : ""}${stock !== null ? ` Stock: ${stock === -1 ? "∞" : stock}` : ""}`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleRestock(interaction, shop) {
        const name = interaction.options.getString("item");
        const amount = interaction.options.getInteger("amount");

        const items = await shop.getItems(interaction.guild.id);
        const item = items.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (!item) return interaction.reply({ embeds: [error("Not Found", "Item not found.")], flags: MessageFlags.Ephemeral });

        const newStock = (item.stock ?? 0) + amount;
        await shop.prisma.shopItem.update({ where: { id: item.id }, data: { stock: newStock } });
        await interaction.reply({
            embeds: [success("Restocked", `**${name}** now has ${newStock} in stock.`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleGrant(interaction, shop) {
        const target = interaction.options.getUser("target");
        const name = interaction.options.getString("item");
        const quantity = interaction.options.getInteger("quantity") ?? 1;

        const items = await shop.getItems(interaction.guild.id);
        const item = items.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (!item) return interaction.reply({ embeds: [error("Not Found", "Item not found.")], flags: MessageFlags.Ephemeral });

        await shop.prisma.shopInventory.upsert({
            where: { guildId_userId_itemId: { guildId: interaction.guild.id, userId: target.id, itemId: item.id } },
            create: { guildId: interaction.guild.id, userId: target.id, itemId: item.id, quantity },
            update: { quantity: { increment: quantity } },
        });

        await interaction.reply({
            embeds: [success("Item Granted", `Gave **${item.name}** x${quantity} to <@${target.id}>`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleRevoke(interaction, shop) {
        const target = interaction.options.getUser("target");
        const name = interaction.options.getString("item");

        const items = await shop.getItems(interaction.guild.id);
        const item = items.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (!item) return interaction.reply({ embeds: [error("Not Found", "Item not found.")], flags: MessageFlags.Ephemeral });

        const inv = await shop.prisma.shopInventory.findUnique({
            where: { guildId_userId_itemId: { guildId: interaction.guild.id, userId: target.id, itemId: item.id } },
        });

        if (!inv) return interaction.reply({ embeds: [error("Not Found", `<@${target.id}> doesn't own this item.`)], flags: MessageFlags.Ephemeral });

        await shop.prisma.shopInventory.delete({ where: { id: inv.id } });
        await interaction.reply({
            embeds: [success("Item Revoked", `Removed **${item.name}** from <@${target.id}>'s inventory.`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleListItems(interaction, shop) {
        const items = await shop.getItems(interaction.guild.id);
        if (!items.length) return interaction.reply({ embeds: [panel("Shop Items", "No items.")], flags: MessageFlags.Ephemeral });

        const lines = items.map(i => `**${i.name}** — ${i.price} coins — Stock: ${i.stock !== null ? i.stock : "∞"}${i.roleId ? ` — Role: <@&${i.roleId}>` : ""}`);
        await interaction.reply({ embeds: [panel(`All Items (${items.length})`, lines.join("\n"))], flags: MessageFlags.Ephemeral });
    },
};
