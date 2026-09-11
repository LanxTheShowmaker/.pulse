import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

const CATEGORIES = {
    moderation: { icon: "\uD83D\uDD28", label: "Moderation", commands: ["warn", "ban", "kick", "timeout", "case"] },
    config: { icon: "\u2699\uFE0F", label: "Configuration", commands: ["config", "automod"] },
    economy: { icon: "\uD83D\uDCB0", label: "Economy", commands: ["coins", "daily", "weekly", "gift"] },
    utility: { icon: "\uD83D\uDCCB", label: "Utility", commands: ["bot", "info", "poll", "ping", "avatar", "serverinfo"] },
    tickets: { icon: "\uD83C\uDFAB", label: "Tickets", commands: ["ticket", "close"] },
    giveaways: { icon: "\uD83C\uDF89", label: "Giveaways", commands: ["giveaway"] },
    shop: { icon: "\uD83D\uDED2", label: "Shop", commands: ["shop", "buy"] },
    fun: { icon: "\uD83C\uDFAE", label: "Fun", commands: ["meme", "8ball"] },
    owner: { icon: "\uD83D\uDD27", label: "Owner", commands: ["eval", "shutdown"] },
};

export default {
    data: new SlashCommandBuilder().setName("help").setDescription("Browse commands by category"),

    async execute(interaction) {
        const embed = panel("Commands", "Use `/help <category>` for more details.");

        for (const [key, cat] of Object.entries(CATEGORIES)) {
            embed.addFields({
                name: `${cat.icon} ${cat.label}`,
                value: cat.commands.map(c => `\`${c}\``).join(", ") || "No commands",
                inline: false,
            });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
