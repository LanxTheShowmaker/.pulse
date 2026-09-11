import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { success, error, panel } from "../../design/embeds.js";
import { requireModerator, ephemeral } from "../moderation/shared.js";

export default {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("Shop management")
        .addSubcommand(sub => sub.setName("view").setDescription("View shop items"))
        .addSubcommand(sub => sub
            .setName("buy")
            .setDescription("Buy an item")
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("inventory").setDescription("View your inventory"))
        .addSubcommand(sub => sub
            .setName("add")
            .setDescription("Add an item (admin)")
            .addStringOption(o => o.setName("name").setDescription("Item name").setRequired(true))
            .addIntegerOption(o => o.setName("price").setDescription("Price in coins").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Description").setRequired(false))
            .addRoleOption(o => o.setName("role").setDescription("Role to grant on purchase").setRequired(false))
            .addIntegerOption(o => o.setName("stock").setDescription("Stock (-1 for unlimited)").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("remove")
            .setDescription("Remove an item (admin)")
            .addStringOption(o => o.setName("item").setDescription("Item name").setRequired(true))
        ),

    async execute(interaction) {
        const { shop } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "view": {
                const items = await shop.getItems(interaction.guild.id);
                if (!items.length) return interaction.reply({ embeds: [panel("Shop", "No items available.")] });
                const lines = items.map(i => `**${i.name}** — ${i.price} coins${i.stock !== null ? ` (${i.stock} left)` : ""}${i.description ? `\n${i.description}` : ""}`);
                await interaction.reply({ embeds: [panel("Shop", lines.join("\n\n"))] });
                break;
            }

            case "buy": {
                const name = interaction.options.getString("item");
                const result = await shop.buyItem(interaction.guild.id, interaction.user.id, name);
                if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
                await interaction.reply({ embeds: [success("Purchased", `Bought **${result.item.name}** for ${result.item.price} coins.`)] });
                break;
            }

            case "inventory": {
                const inv = await shop.getInventory(interaction.guild.id, interaction.user.id);
                if (!inv.length) return interaction.reply({ embeds: [panel("Inventory", "Empty.")], flags: MessageFlags.Ephemeral });
                const lines = inv.map(i => `• ${i.itemId} x${i.quantity}`);
                await interaction.reply({ embeds: [panel("Inventory", lines.join("\n"))], flags: MessageFlags.Ephemeral });
                break;
            }

            case "add": {
                if (!await requireModerator(interaction)) return ephemeral(interaction, "Permission denied.");
                const name = interaction.options.getString("name");
                const price = interaction.options.getInteger("price");
                const description = interaction.options.getString("description");
                const role = interaction.options.getRole("role");
                const stock = interaction.options.getInteger("stock");

                await shop.addItem(interaction.guild.id, name, description, price, role?.id, null, stock === -1 ? null : stock);
                await interaction.reply({ embeds: [success("Item Added", `**${name}** — ${price} coins`)] });
                break;
            }

            case "remove": {
                if (!await requireModerator(interaction)) return ephemeral(interaction, "Permission denied.");
                const name = interaction.options.getString("item");
                const removed = await shop.removeItem(interaction.guild.id, name);
                if (!removed) return interaction.reply({ embeds: [error("Not Found", "Item not found.")] });
                await interaction.reply({ embeds: [success("Removed", `**${removed.name}** removed.`)] });
                break;
            }
        }
    },
};
