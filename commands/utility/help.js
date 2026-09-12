import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../ui/embeds.js";
import { Theme } from "../../ui/theme.js";

const CATEGORY_META = {
    moderation: { icon: "🔨", label: "Moderation" },
    config: { icon: "⚙️", label: "Configuration" },
    automod: { icon: "🛡️", label: "Automod" },
    economy: { icon: "💰", label: "Economy" },
    utility: { icon: "📋", label: "Utility" },
    tickets: { icon: "🎫", label: "Tickets" },
    giveaway: { icon: "🎉", label: "Giveaways" },
    shop: { icon: "🛒", label: "Shop" },
    fun: { icon: "🎮", label: "Fun" },
    owner: { icon: "🔧", label: "Owner" },
};

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Browse commands by category")
        .addStringOption(o =>
            o.setName("category").setDescription("Category to view").setRequired(false)
                .addChoices(
                    ...Object.entries(CATEGORY_META).map(([k, v]) => ({ name: `${v.icon} ${v.label}`, value: k })),
                ),
        ),

    async execute(interaction) {
        const commands = interaction.client.commands;
        const category = interaction.options.getString("category");

        // Build category map from registered commands
        const categories = {};
        for (const [name, cmd] of commands) {
            const cat = cmd.category || "utility";
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(cmd);
        }

        if (category) {
            const cmds = categories[category];
            const meta = CATEGORY_META[category] || { icon: "📋", label: category };

            if (!cmds || cmds.length === 0) {
                return interaction.reply({
                    embeds: [panel("No Commands", `No commands in **${meta.label}**.`)],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = panel(
                `${meta.icon} ${meta.label}`,
                cmds.map(c => `\`/${c.data.name}\` — ${c.data.description}`).join("\n"),
            );

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Overview
        const embed = panel("Commands", "Use `/help <category>` to see commands in a category.");

        const sorted = Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [cat, cmds] of sorted) {
            const meta = CATEGORY_META[cat] || { icon: "📋", label: cat };
            embed.addFields({
                name: `${meta.icon} ${meta.label} (${cmds.length})`,
                value: cmds.map(c => `\`/${c.data.name}\``).join(", "),
                inline: false,
            });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
