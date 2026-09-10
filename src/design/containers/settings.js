import { createContainer, createActionRow, createButton, ButtonStyle, divider, headerText, bodyText, mutedText, spacer, createSelectMenu, createSelectOption, subHeaderText } from "./base.js";
import { Theme, Brand } from "../../design/theme.js";

export function settingsMainPanel(guild, config) {
    const modules = JSON.parse(config.modules || "{}");
    const moduleList = [
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
    
    const components = [
        headerText(`Server Settings`),
        bodyText(`Configuring **${guild.name}** (\`${guild.id}\`)`),
        divider(),
        subHeaderText("Modules"),
    ];
    
    for (const mod of moduleList) {
        const enabled = modules[mod.key] !== false;
        components.push(bodyText(`${enabled ? "Enabled" : "Disabled"} **${mod.name}** — ${mod.desc}`));
    }
    
    components.push(divider());
    components.push(subHeaderText("Quick Actions"));
    components.push(createActionRow(
        createButton("settings:modules", "Manage Modules", ButtonStyle.Primary),
        createButton("settings:automod", "AutoMod Config", ButtonStyle.Secondary),
        createButton("settings:logs", "Log Channels", ButtonStyle.Secondary),
    ));
    components.push(createActionRow(
        createButton("settings:staff", "Staff Roles", ButtonStyle.Secondary),
        createButton("settings:ignored", "Ignored Channels/Roles", ButtonStyle.Secondary),
        createButton("settings:prefix", "Prefix", ButtonStyle.Secondary),
    ));
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function moduleTogglePanel(modules) {
    const moduleList = [
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
    
    const components = [
        headerText(`Module Management`),
        divider(),
    ];
    
    for (const mod of moduleList) {
        const enabled = modules[mod.key] !== false;
        components.push(createActionRow(
            createButton(`settings:module:toggle:${mod.key}`, enabled ? "Disable" : "Enable", enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            createButton(`settings:module:config:${mod.key}`, "Configure", ButtonStyle.Secondary),
        ));
        components.push(mutedText(`${mod.name} — ${mod.desc}`));
        components.push(divider());
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function automodConfigPanel(config) {
    const rules = config.rules || {};
    const thresholds = config.thresholds || { warn: 3, timeout: 5, kick: 7, ban: 10 };
    const exemptRoles = config.exemptRoles || [];
    const exemptChannels = config.exemptChannels || [];
    const exemptUsers = config.exemptUsers || [];
    
    const components = [
        headerText(`AutoMod Configuration`),
        divider(),
        subHeaderText("Rules"),
    ];
    
    const ruleDefs = [
        { key: "spam", name: "Spam Detection", desc: "Repeated similar messages" },
        { key: "caps", name: "Caps Lock", desc: "Excessive capital letters" },
        { key: "links", name: "Links", desc: "URL detection" },
        { key: "invites", name: "Discord Invites", desc: "discord.gg/ links" },
        { key: "mentions", name: "Mass Mentions", desc: "Excessive @ mentions" },
        { key: "emojiSpam", name: "Emoji Spam", desc: "Excessive emojis" },
        { key: "words", name: "Banned Words", desc: "Custom word filter" },
        { key: "regex", name: "Custom Regex", desc: "Custom pattern matching" },
        { key: "duplicate", name: "Duplicate Messages", desc: "Exact duplicate detection" },
        { key: "raid", name: "Raid Protection", desc: "Mass join detection" },
    ];
    
    for (const rule of ruleDefs) {
        const enabled = rules[rule.key] !== false;
        const action = rules[rule.key]?.action || "warn";
        components.push(bodyText(`${enabled ? "Enabled" : "Disabled"} **${rule.name}** — ${rule.desc} (Action: ${action})`));
    }
    
    components.push(divider());
    components.push(subHeaderText("Thresholds"));
    components.push(bodyText(`**Warn:** ${thresholds.warn} infractions`));
    components.push(bodyText(`**Timeout:** ${thresholds.timeout} infractions`));
    components.push(bodyText(`**Kick:** ${thresholds.kick} infractions`));
    components.push(bodyText(`**Ban:** ${thresholds.ban} infractions`));
    
    components.push(divider());
    components.push(subHeaderText("Exemptions"));
    components.push(bodyText(`**Exempt Roles:** ${exemptRoles.length ? exemptRoles.map(r => `<@&${r}>`).join(", ") : "None"}`));
    components.push(bodyText(`**Exempt Channels:** ${exemptChannels.length ? exemptChannels.map(c => `<#${c}>`).join(", ") : "None"}`));
    components.push(bodyText(`**Exempt Users:** ${exemptUsers.length ? exemptUsers.map(u => `<@${u}>`).join(", ") : "None"}`));
    
    components.push(divider());
    components.push(createActionRow(
        createButton("automod:rules", "Configure Rules", ButtonStyle.Primary),
        createButton("automod:thresholds", "Edit Thresholds", ButtonStyle.Secondary),
        createButton("automod:exemptions", "Manage Exemptions", ButtonStyle.Secondary),
    ));
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function logChannelsPanel(config) {
    const components = [
        headerText(`Log Channels`),
        divider(),
        bodyText(`**Moderation Log:** ${config.modLogChannelId ? `<#${config.modLogChannelId}>` : "Not set"}`),
        bodyText(`**General Log:** ${config.logChannelId ? `<#${config.logChannelId}>` : "Not set"}`),
        bodyText(`**Welcome Channel:** ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "Not set"}`),
        bodyText(`**Goodbye Channel:** ${config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : "Not set"}`),
        divider(),
        createActionRow(
            createButton("settings:logs:modlog", "Set Mod Log", ButtonStyle.Primary),
            createButton("settings:logs:generallog", "Set General Log", ButtonStyle.Secondary),
            createButton("settings:logs:welcome", "Set Welcome", ButtonStyle.Secondary),
        ),
        createActionRow(
            createButton("settings:logs:goodbye", "Set Goodbye", ButtonStyle.Secondary),
            createButton("settings:logs:clear", "Clear All", ButtonStyle.Danger),
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function staffRolesPanel(config) {
    const components = [
        headerText(`Staff Roles`),
        divider(),
        bodyText(`**Staff Roles:** ${config.staffRoleIds?.length ? config.staffRoleIds.split(",").map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Moderator Roles:** ${config.moderatorRoleIds?.length ? config.moderatorRoleIds.split(",").map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Ignored Roles:** ${config.ignoredRoleIds?.length ? config.ignoredRoleIds.split(",").map(r => `<@&${r}>`).join(", ") : "None"}`),
        bodyText(`**Ignored Users:** ${config.ignoredUserIds?.length ? config.ignoredUserIds.split(",").map(u => `<@${u}>`).join(", ") : "None"}`),
        bodyText(`**Ignored Channels:** ${config.ignoredChannelIds?.length ? config.ignoredChannelIds.split(",").map(c => `<#${c}>`).join(", ") : "None"}`),
        divider(),
        createActionRow(
            createButton("settings:staff:add", "Add Staff Role", ButtonStyle.Primary),
            createButton("settings:staff:addmod", "Add Mod Role", ButtonStyle.Secondary),
            createButton("settings:staff:addignored", "Add Ignored", ButtonStyle.Secondary),
        ),
        createActionRow(
            createButton("settings:staff:remove", "Remove Role", ButtonStyle.Danger),
            createButton("settings:staff:clear", "Clear All", ButtonStyle.Danger),
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}

export function prefixPanel(prefix) {
    const components = [
        headerText(`Command Prefix`),
        divider(),
        bodyText(`**Current Prefix:** \`${prefix || "!"}\``),
        divider(),
        bodyText("The prefix is used for text-based commands. Slash commands work regardless."),
        createActionRow(
            createButton("settings:prefix:set", "Change Prefix", ButtonStyle.Primary),
            createButton("settings:prefix:reset", "Reset to Default", ButtonStyle.Secondary),
        ),
        spacer(),
        mutedText(Brand.footer),
    ];
    
    return createContainer(components);
}