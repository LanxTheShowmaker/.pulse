import {
    SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, UserSelectMenuBuilder, MessageFlags,
} from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
import { logger } from "../../core/logger.js";

const DEFAULT_CATEGORIES = [
    { value: "logo", label: "Logo", description: "Brand / server logos" },
    { value: "banner", label: "Banner", description: "Server or profile banners" },
    { value: "emote", label: "Emote / Emoji", description: "Custom emotes and emoji" },
    { value: "overlay", label: "Stream Overlay", description: "Twitch / OBS overlays" },
    { value: "thumbnail", label: "Thumbnail", description: "YouTube / social thumbnails" },
    { value: "other", label: "Other", description: "Something else" },
];

export default {
    data: new SlashCommandBuilder()
        .setName("order")
        .setDescription("Design order system (legacy — use /setuptickets Orders)")
        .addSubcommand((s) => s.setName("panel").setDescription("Post the design-order panel with a Request Design button"))
        .addSubcommand((s) => s.setName("list").setDescription("List open design orders (staff)"))
        .addSubcommand((s) => s.setName("categories").setDescription("Manage design categories")
            .addStringOption((o) => o.setName("action").setDescription("Category action").addChoices(
                { name: "list", value: "list" },
                { name: "add", value: "add" },
                { name: "remove", value: "remove" },
            ))
            .addStringOption((o) => o.setName("value").setDescription("Category value (for add/remove)"))
            .addStringOption((o) => o.setName("label").setDescription("Category label (for add)"))
            .addStringOption((o) => o.setName("description").setDescription("Category description (for add)"))),
    category: "Orders",
    async execute(interaction) {
        const client = interaction.client;
        const sub = interaction.options.getSubcommand();
        const config = await client.services.settings.get(interaction.guildId).catch(() => null);
        if (!isStaff(interaction.member, config)) {
            return interaction.reply({ embeds: [embeds.error("Missing permission", "Only staff can use order management.")], flags: MessageFlags.Ephemeral });
        }
        if (sub === "panel") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const service = client.services.orders;
            try {
                await interaction.channel.send({
                    embeds: [service.buildPanelEmbed()],
                    components: [service.buildOpenButton()],
                });
            }
            catch (e) {
                logger.error("orders", "panel send failed", e);
                return interaction.editReply({ embeds: [embeds.error("Could not post panel", "I may be missing permission to send messages here.")] });
            }
            await interaction.editReply({ embeds: [embeds.success("Panel posted", "The design-order panel was sent to this channel.")] });
            return interaction.followUp({ embeds: [embeds.info("Heads up — Legacy", "This `/order` panel is **legacy**. For new servers, use `/setuptickets` → **Orders** panel (per-guild banners, ticket types, categories). Your existing tickets still work.", [], { footer: "Legacy command. Use /setuptickets Orders." })], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        if (sub === "list") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const orders = await client.services.orders.listOpen(interaction.guild).catch(() => []);
            if (!orders.length) {
                return interaction.editReply({ embeds: [embeds.info("Open orders", "There are no open design orders right now.")] });
            }
            const lines = orders.map((o) => `**<#${o.channelId}>** · \`${o.category}\` · ${o.claimedById ? `<@${o.claimedById}>` : "Unclaimed"} · ${o.status}`);
            return interaction.editReply({ embeds: [embeds.info("Open design orders", lines.join("\n"))] });
        }
        if (sub === "categories") {
            return this.handleCategories(interaction, client);
        }
    },
    async handleCategories(interaction, client) {
        const action = interaction.options.getString("action") ?? "list";
        const settings = client.services.settings;
        const current = await settings.get(interaction.guildId);
        const cats = (current.orders?.categories ?? DEFAULT_CATEGORIES).slice();
        if (action === "list") {
            const list = cats.map((c) => `**${c.label}** (\`${c.value}\`) — ${c.description}`).join("\n");
            return interaction.reply({ embeds: [embeds.info("Design categories", list || "No categories configured.")], flags: MessageFlags.Ephemeral });
        }
        if (action === "add") {
            const value = interaction.options.getString("value");
            const label = interaction.options.getString("label");
            const description = interaction.options.getString("description") ?? "";
            if (!value || !label) {
                return interaction.reply({ embeds: [embeds.error("Missing fields", "Provide `value` and `label` to add a category.")], flags: MessageFlags.Ephemeral });
            }
            if (cats.some((c) => c.value === value)) {
                return interaction.reply({ embeds: [embeds.warn("Already exists", `Category \`${value}\` already exists.`)], flags: MessageFlags.Ephemeral });
            }
            cats.push({ value, label, description });
            await settings.patch(interaction.guildId, { orders: { categories: cats } });
            return interaction.reply({ embeds: [embeds.success("Category added", `Added **${label}** (\`${value}\`).`)], flags: MessageFlags.Ephemeral });
        }
        if (action === "remove") {
            const value = interaction.options.getString("value");
            if (!value) {
                return interaction.reply({ embeds: [embeds.error("Missing field", "Provide `value` to remove a category.")], flags: MessageFlags.Ephemeral });
            }
            const next = cats.filter((c) => c.value !== value);
            if (next.length === cats.length) {
                return interaction.reply({ embeds: [embeds.warn("Not found", `No category \`${value}\`.`)], flags: MessageFlags.Ephemeral });
            }
            await settings.patch(interaction.guildId, { orders: { categories: next } });
            return interaction.reply({ embeds: [embeds.success("Category removed", `Removed \`${value}\`.`)], flags: MessageFlags.Ephemeral });
        }
    },
};
