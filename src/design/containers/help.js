import { createContainer, createActionRow, createButton, ButtonStyle, divider, headerText, bodyText, mutedText, spacer, subHeaderText } from "./base.js";
import { Theme, Brand } from "../../design/theme.js";

const CATEGORIES = [
    { key: "moderation", name: "Moderation", emoji: "🛡️", desc: "Warn, ban, kick, timeout, cases, history" },
    { key: "tickets", name: "Tickets", emoji: "🎫", desc: "Create, manage, configure support tickets" },
    { key: "automod", name: "AutoMod", emoji: "🤖", desc: "Configure automated moderation rules" },
    { key: "settings", name: "Settings", emoji: "⚙️", desc: "Server configuration, modules, logs, roles" },
    { key: "welcome", name: "Welcome", emoji: "👋", desc: "Join/leave messages, autoroles" },
    { key: "starboard", name: "Starboard", emoji: "⭐", desc: "Starred messages channel" },
    { key: "leveling", name: "Leveling", emoji: "📈", desc: "XP, levels, rewards, leaderboards" },
    { key: "economy", name: "Economy", emoji: "💰", desc: "Balance, shop, daily, trading, inventory" },
    { key: "reactionroles", name: "Reaction Roles", emoji: "🎭", desc: "Role assignment via reactions" },
    { key: "giveaways", name: "Giveaways", emoji: "🎉", desc: "Create and manage giveaways" },
    { key: "suggestions", name: "Suggestions", emoji: "💡", desc: "Community suggestion system" },
    { key: "logging", name: "Logging", emoji: "📋", desc: "Message, moderation, server logs" },
    { key: "orders", name: "Orders", emoji: "🛒", desc: "Design order system" },
    { key: "utility", name: "Utility", emoji: "🔧", desc: "Info, diagnostics, reminders, polls, AFK" },
    { key: "fun", name: "Fun", emoji: "🎮", desc: "Games, memes, 8ball, coinflip, RPS" },
];

export function helpMainPanel() {
    const components = [
        headerText(`.pulse — Command Help`),
        bodyText("Use the buttons below to browse commands by category."),
        divider(),
    ];
    
    for (let i = 0; i < CATEGORIES.length; i += 3) {
        const row = [];
        for (let j = 0; j < 3 && i + j < CATEGORIES.length; j++) {
            const cat = CATEGORIES[i + j];
            row.push(createButton(`help:category:${cat.key}`, cat.name, ButtonStyle.Secondary));
        }
        components.push(createActionRow(...row));
    }
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function helpCategoryPanel(categoryKey, commands) {
    const category = CATEGORIES.find(c => c.key === categoryKey);
    const name = category?.name || categoryKey;
    
    const components = [
        headerText(`${name} Commands`),
        divider(),
    ];
    
    if (commands.length === 0) {
        components.push(bodyText("No commands in this category — select another category."));
    } else {
        for (const cmd of commands) {
            const options = cmd.data.options?.map(o => `\`${o.name}\``).join(", ") || "none";
            components.push(bodyText(`**/${cmd.data.name}** — ${cmd.data.description}\n-# Options: ${options}`));
        }
    }
    
    components.push(divider());
    components.push(createActionRow(
        createButton("help:main", "Back to Categories", ButtonStyle.Secondary),
    ));
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}

export function helpCommandPanel(command) {
    const components = [
        headerText(`/${command.data.name}`),
        divider(),
        bodyText(`**Description:** ${command.data.description}`),
    ];
    
    if (command.data.options?.length) {
        components.push(subHeaderText("Options"));
        for (const opt of command.data.options) {
            const required = opt.required ? " (required)" : " (optional)";
            const choices = opt.choices?.map(c => c.name).join(", ") || "";
            components.push(bodyText(`\`${opt.name}\`${required} — ${opt.description}${choices ? ` [${choices}]` : ""}`));
        }
    }
    
    if (command.category) {
        components.push(divider());
        components.push(bodyText(`**Category:** ${command.category}`));
    }
    
    components.push(divider());
    components.push(createActionRow(
        createButton("help:main", "Back to Help", ButtonStyle.Secondary),
    ));
    
    components.push(spacer());
    components.push(mutedText(Brand.footer));
    
    return createContainer(components);
}