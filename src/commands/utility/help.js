import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";
import { row, button, selectMenu } from "../../design/components.js";
import { ButtonStyle } from "discord.js";

const CATEGORIES = {
    moderation: { label: "Moderation", desc: "warn, ban, kick, timeout, case management", commands: ["moderation"] },
    config: { label: "Configuration", desc: "server settings, modules, automod", commands: ["config", "automod"] },
    economy: { label: "Economy", desc: "coins, daily, weekly, gift", commands: ["economy"] },
    leveling: { label: "Leveling", desc: "XP, levels, leaderboard", commands: ["level", "leaderboard"] },
    giveaways: { label: "Giveaways", desc: "create, end, reroll giveaways", commands: ["giveaway"] },
    tickets: { label: "Tickets", desc: "support ticket system", commands: ["tickets"] },
    utility: { label: "Utility", desc: "info, avatar, poll, ping", commands: ["bot", "info", "poll", "ping"] },
};

export default {
    data: new SlashCommandBuilder().setName("help").setDescription("Browse commands by category"),

    async execute(interaction) {
        const lines = Object.entries(CATEGORIES).map(([key, cat]) => {
            return `**${cat.label}** — ${cat.desc}\n\`${cat.commands.join(", ")}\``;
        });

        const embed = panel("Commands", lines.join("\n\n"));
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
