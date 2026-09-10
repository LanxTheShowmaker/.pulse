import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } from "discord.js";
import { containerReply, containerEdit } from "../../design/containers/base.js";
import { settingsMainPanel, moduleTogglePanel, automodConfigPanel, logChannelsPanel, staffRolesPanel, prefixPanel } from "../../design/containers/settings.js";
import { errorPanel, successPanel } from "../../design/containers/panels.js";
import { isStaff } from "../../core/services.js";

const MODULES = [
    { key: "moderation", name: "Moderation", desc: "Warn, ban, kick, timeout, cases" },
    { key: "automod", name: "AutoMod", desc: "Spam, links, invites, caps, words protection" },
    { key: "tickets", name: "Tickets", desc: "Support ticket system" },
    { key: "welcome", name: "Welcome", desc: "Member join/leave messages" },
    { key: "starboard", name: "Starboard", desc: "Starred messages channel" },
    { key: "leveling", name: "Leveling", desc: "XP, levels, rewards" },
    { key: "economy", name: "Economy", desc: "Balance, shop, daily, trading" },
    { key: "reactionroles", name: "Reaction Roles", desc: "Role assignment via reactions" },
    { key: "giveaways", name: "Giveaways", desc: "Giveaway creation and management" },
    { key: "suggestions", name: "Suggestions", desc: "Community suggestion system" },
    { key: "logging", name: "Logging", desc: "Message, moderation, server logs" },
    { key: "orders", name: "Orders", desc: "Design order system" },
];

export default {
    data: new SlashCommandBuilder()
        .setName("config")
        .setDescription("Server configuration center")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName("view").setDescription("View current configuration"))
        .addSubcommand(s => s.setName("modules").setDescription("Manage enabled modules"))
        .addSubcommand(s => s.setName("automod").setDescription("Configure AutoMod"))
        .addSubcommand(s => s.setName("logs").setDescription("Configure log channels"))
        .addSubcommand(s => s.setName("staff").setDescription("Configure staff roles"))
        .addSubcommand(s => s.setName("prefix").setDescription("Configure command prefix")),
    category: "Config",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const client = interaction.client;
        const prisma = client.prisma;
        
        const cfg = await client.services.settings.get(interaction.guildId).catch(() => null);
        if (!isStaff(interaction.member, cfg)) {
            return containerReply(interaction, errorPanel("Missing Permission", "You need staff permissions to use this command."), true);
        }
        
        if (sub === "view") {
            const panel = settingsMainPanel(interaction.guild, cfg);
            return containerReply(interaction, panel, true);
        }
        
        if (sub === "modules") {
            const modules = JSON.parse(cfg.modules || "{}");
            const panel = moduleTogglePanel(modules);
            return containerReply(interaction, panel, true);
        }
        
        if (sub === "automod") {
            const automod = JSON.parse(cfg.automod || "{}");
            const panel = automodConfigPanel(automod);
            return containerReply(interaction, panel, true);
        }
        
        if (sub === "logs") {
            const panel = logChannelsPanel(cfg);
            return containerReply(interaction, panel, true);
        }
        
        if (sub === "staff") {
            const panel = staffRolesPanel(cfg);
            return containerReply(interaction, panel, true);
        }
        
        if (sub === "prefix") {
            const prefix = cfg.prefix || "!";
            const panel = prefixPanel(prefix);
            return containerReply(interaction, panel, true);
        }
    }
};

// Component handlers for interactive settings
export const componentHandlers = {
    "settings:module:toggle:": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const key = i.customId.replace("settings:module:toggle:", "");
        const cfg = await i.client.services.settings.get(i.guildId);
        const modules = JSON.parse(cfg.modules || "{}");
        modules[key] = !modules[key];
        await i.client.services.settings.patch(i.guildId, { modules });
        
        const panel = moduleTogglePanel(modules);
        await i.update({ components: [panel] });
    },
    
    "settings:module:config:": async (i) => {
        const key = i.customId.replace("settings:module:config:", "");
        if (key === "automod") {
            const cfg = await i.client.services.settings.get(i.guildId);
            const automod = JSON.parse(cfg.automod || "{}");
            const panel = automodConfigPanel(automod);
            await i.update({ components: [panel] });
        }
    },
    
    "settings:logs:modlog": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const { createContainer, createActionRow, divider, headerText, bodyText, mutedText, spacer } = await import("../../design/containers/base.js");
        const { ChannelSelectMenuBuilder, ChannelType } = await import("discord.js");
        
        const menu = new ChannelSelectMenuBuilder()
            .setCustomId("settings:logs:modlog:select")
            .setPlaceholder("Select mod log channel")
            .addChannelTypes(ChannelType.GuildText);
        
        const container = createContainer([
            headerText("Set Moderation Log Channel"),
            divider(),
            bodyText("Select the channel for moderation logs:"),
            divider(),
            createActionRow(menu),
        ]);
        
        await i.update({ components: [container] });
    },
    
    "settings:logs:modlog:select": async (i) => {
        const channelId = i.values[0];
        await i.client.services.settings.patch(i.guildId, { modLogChannelId: channelId });
        
        const cfg = await i.client.services.settings.get(i.guildId);
        const panel = logChannelsPanel(cfg);
        await i.update({ components: [panel] });
    },
    
    "settings:logs:generallog": async (i) => {
        const { createContainer, createActionRow, divider, headerText, bodyText, mutedText, spacer } = await import("../../design/containers/base.js");
        const { ChannelSelectMenuBuilder, ChannelType } = await import("discord.js");
        
        const menu = new ChannelSelectMenuBuilder()
            .setCustomId("settings:logs:generallog:select")
            .setPlaceholder("Select general log channel")
            .addChannelTypes(ChannelType.GuildText);
        
        const container = createContainer([
            headerText("Set General Log Channel"),
            divider(),
            bodyText("Select the channel for general logs:"),
            divider(),
            createActionRow(menu),
        ]);
        
        await i.update({ components: [container] });
    },
    
    "settings:logs:generallog:select": async (i) => {
        await i.client.services.settings.patch(i.guildId, { logChannelId: i.values[0] });
        const cfg = await i.client.services.settings.get(i.guildId);
        const panel = logChannelsPanel(cfg);
        await i.update({ components: [panel] });
    },
    
    "settings:prefix:set": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import("discord.js");
        
        const modal = new ModalBuilder()
            .setCustomId("settings:prefix:modal")
            .setTitle("Set Command Prefix");
        
        const input = new TextInputBuilder()
            .setCustomId("prefix")
            .setLabel("New prefix (1-5 characters)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(5)
            .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        
        await i.showModal(modal);
    },
    
    "settings:prefix:modal": async (i) => {
        const prefix = i.fields.getTextInputValue("prefix");
        await i.client.services.settings.patch(i.guildId, { prefix });
        
        const cfg = await i.client.services.settings.get(i.guildId);
        const panel = prefixPanel(cfg.prefix);
        await i.update({ components: [panel] });
    },
    
    "settings:prefix:reset": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        await i.client.services.settings.patch(i.guildId, { prefix: "!" });
        const panel = prefixPanel("!");
        await i.update({ components: [panel] });
    },
    
    "settings:staff:add": async (i) => {
        const { RoleSelectMenuBuilder } = await import("discord.js");
        const { createContainer, createActionRow, divider, headerText, bodyText, mutedText, spacer } = await import("../../design/containers/base.js");
        
        const menu = new RoleSelectMenuBuilder()
            .setCustomId("settings:staff:add:select")
            .setPlaceholder("Select staff role(s)")
            .setMinValues(1)
            .setMaxValues(10);
        
        const container = createContainer([
            headerText("Add Staff Role"),
            divider(),
            bodyText("Select role(s) to add as staff:"),
            divider(),
            createActionRow(menu),
        ]);
        
        await i.update({ components: [container] });
    },
    
    "settings:staff:add:select": async (i) => {
        const cfg = await i.client.services.settings.get(i.guildId);
        const current = cfg.staffRoleIds ? cfg.staffRoleIds.split(",") : [];
        const newRoles = [...new Set([...current, ...i.values])];
        await i.client.services.settings.patch(i.guildId, { staffRoleIds: newRoles.join(",") });
        
        const panel = staffRolesPanel(await i.client.services.settings.get(i.guildId));
        await i.update({ components: [panel] });
    },
};