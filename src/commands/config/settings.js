import { SlashCommandBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
const CATEGORIES = [
    { value: "logging", label: "Logging", description: "Log & mod-log channels" },
    { value: "moderation", label: "Moderation", description: "Prefix, case behavior" },
    { value: "welcome", label: "Welcome & Goodbye", description: "Join/leave channels" },
    { value: "orders", label: "Orders", description: "Design order system" },
    { value: "automod", label: "Automod", description: "Filters & thresholds" },
    { value: "general", label: "General", description: "Overview & roles" },
];
function mainEmbed(config) {
    return embeds.info("Server Settings", "Select a category to configure.", [
        { name: "Prefix", value: config.prefix, inline: true },
        { name: "Staff roles", value: `${config.staffRoleIds.length}`, inline: true },
        { name: "Mod roles", value: `${config.moderatorRoleIds.length}`, inline: true },
    ]);
}
function mainRow() {
    const menu = new StringSelectMenuBuilder().setCustomId("pulse:settings:menu").setPlaceholder("Choose a category").addOptions(CATEGORIES);
    return new ActionRowBuilder().addComponents(menu);
}
function backRow() {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:settings:back").setLabel("Back").setStyle(ButtonStyle.Secondary));
}
function channelRow(customId, placeholder) {
    const menu = new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);
    return new ActionRowBuilder().addComponents(menu);
}
export default {
    data: new SlashCommandBuilder().setName("settings").setDescription("Configure settings for this server"),
    category: "Config",
    async execute(interaction) {
        const client = interaction.client;
        const member = interaction.member;
        const config = await client.services.settings.get(interaction.guildId).catch(() => null);
        if (!isStaff(member, config)) {
            return interaction.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const cfg = await client.services.settings.get(interaction.guildId);
        client.components.set("pulse:settings:menu", async (i) => {
            const category = i.values[0];
            await renderCategory(i, category, await client.services.settings.get(i.guildId));
        });
        client.components.set("pulse:settings:back", async (i) => {
            await i.update({ embeds: [mainEmbed(await client.services.settings.get(i.guildId))], components: [mainRow()] });
        });
        client.components.set("pulse:settings:channel:logChannelId", async (i) => {
            const id = i.values[0];
            await         i.client.services.settings.patch(i.guildId, { logChannelId: id });
            await renderCategory(i, "logging", await client.services.settings.get(i.guildId));
        });
        client.components.set("pulse:settings:channel:modLogChannelId", async (i) => {
            const id = i.values[0];
            await         i.client.services.settings.patch(i.guildId, { modLogChannelId: id });
            await renderCategory(i, "logging", await client.services.settings.get(i.guildId));
        });
        client.components.set("pulse:settings:channel:welcomeChannelId", async (i) => {
            const id = i.values[0];
            await         i.client.services.settings.patch(i.guildId, { welcomeChannelId: id });
            await renderCategory(i, "welcome", await client.services.settings.get(i.guildId));
        });
        client.components.set("pulse:settings:channel:goodbyeChannelId", async (i) => {
            const id = i.values[0];
            await         i.client.services.settings.patch(i.guildId, { goodbyeChannelId: id });
            await renderCategory(i, "welcome", await client.services.settings.get(i.guildId));
        });
        client.components.set("pulse:settings:prefix", async (i) => {
            const modal = new ModalBuilder().setCustomId("pulse:settings:prefix:modal").setTitle("Set command prefix");
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("prefix").setLabel("Prefix").setStyle(TextInputStyle.Short).setMaxLength(3).setValue(cfg.prefix)));
            await i.showModal(modal);
        });
        client.components.set("pulse:settings:prefix:modal", async (i) => {
            const prefix = i.fields.getTextInputValue("prefix");
            await client.services.settings.patch(i.guildId, { prefix });
            await i.reply({ embeds: [embeds.success("Prefix updated", `Commands prefix set to \`${prefix}\`.`)], flags: MessageFlags.Ephemeral });
        });
        await interaction.editReply({ embeds: [mainEmbed(cfg)], components: [mainRow()] });
    },
};
async function renderCategory(i, category, cfg) {
    if (category === "logging") {
        const embed = embeds.info("Settings · Logging", "Choose where logs are sent.", [
            { name: "Log channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Not configured", inline: true },
            { name: "Mod-log channel", value: cfg.modLogChannelId ? `<#${cfg.modLogChannelId}>` : "Not configured", inline: true },
        ]);
        await i.update({
            embeds: [embed],
            components: [channelRow("pulse:settings:channel:logChannelId", "Log channel"), channelRow("pulse:settings:channel:modLogChannelId", "Mod-log channel"), backRow()],
        });
        return;
    }
    if (category === "welcome") {
        const embed = embeds.info("Settings · Welcome & Goodbye", "Choose where join/leave messages are sent.", [
            { name: "Welcome channel", value: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "Not configured", inline: true },
            { name: "Goodbye channel", value: cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : "Not configured", inline: true },
        ]);
        await i.update({
            embeds: [embed],
            components: [channelRow("pulse:settings:channel:welcomeChannelId", "Welcome channel"), channelRow("pulse:settings:channel:goodbyeChannelId", "Goodbye channel"), backRow()],
        });
        return;
    }
    if (category === "moderation") {
        const embed = embeds.info("Settings · Moderation", "Adjust moderation behavior.", [
            { name: "Prefix", value: cfg.prefix, inline: true },
        ]);
        const prefixBtn = new ButtonBuilder().setCustomId("pulse:settings:prefix").setLabel("Edit prefix").setStyle(ButtonStyle.Primary);
        await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(prefixBtn), backRow()] });
        return;
    }
    if (category === "orders") {
        const cats = cfg.orders?.categories;
        await i.update({ embeds: [embeds.info("Settings · Orders", "Manage the design-order system. Use `/order categories` to add or remove design types.", [
            { name: "Categories", value: cats?.length ? cats.map((c) => `**${c.label}** (\`${c.value}\`)`).join(", ") : "Default categories in use." },
        ])], components: [backRow()] });
        return;
    }
    if (category === "automod") {
        const automod = cfg.automod;
        await i.update({ embeds: [embeds.info("Settings · Automod", "Current automod configuration.", [{ name: "Config", value: `\`\`\`json\n${JSON.stringify(automod, null, 2)}\n\`\`\`` }])], components: [backRow()] });
        return;
    }
    await i.update({ embeds: [mainEmbed(cfg)], components: [mainRow()] });
}
//# sourceMappingURL=settings.js.map