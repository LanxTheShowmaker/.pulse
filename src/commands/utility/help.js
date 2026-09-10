import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { containerReply, containerFollowUp } from "../../design/containers/base.js";
import { helpMainPanel, helpCategoryPanel, helpCommandPanel } from "../../design/containers/help.js";
import { errorPanel } from "../../design/containers/panels.js";

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

function getCommandsForCategory(client, categoryKey) {
    const commands = [];
    for (const [name, cmd] of client.commands) {
        if (cmd.category?.toLowerCase() === categoryKey) {
            commands.push(cmd);
        }
    }
    return commands;
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Browse .pulse commands and features"),
    category: "Utility",
    async execute(interaction) {
        const client = interaction.client;
        const container = helpMainPanel();
        await containerReply(interaction, container, true);
        
        for (const cat of CATEGORIES) {
            client.components.set(`help:category:${cat.key}`, async (i) => {
                const commands = getCommandsForCategory(client, cat.key);
                const panel = helpCategoryPanel(cat.key, commands);
                await i.update({ components: [panel] });
            });
        }
        
        client.components.set("help:main", async (i) => {
            const panel = helpMainPanel();
            await i.update({ components: [panel] });
        });
        
        client.components.set("help:command:", async (i) => {
            const cmdName = i.customId.replace("help:command:", "");
            const cmd = client.commands.get(cmdName);
            if (!cmd) {
                await i.update({ components: [errorPanel("Not Found", "Command not found")] });
                return;
            }
            const panel = helpCommandPanel(cmd);
            await i.update({ components: [panel] });
        });
    }
};