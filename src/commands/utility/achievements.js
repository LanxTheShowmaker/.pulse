import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel, stat } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

const CATEGORY_ICONS = {
    economy: "💰",
    leveling: "⭐",
    moderation: "🔨",
    support: "🎫",
    giveaways: "🎉",
    fun: "🎮",
    social: "💬",
    general: "📋",
};

export default {
    category: "utility",
    data: new SlashCommandBuilder()
        .setName("achievements")
        .setDescription("View achievements")
        .addSubcommand(sub => sub
            .setName("list")
            .setDescription("List all achievements")
            .addStringOption(o => o.setName("category").setDescription("Filter by category").setRequired(false)
                .addChoices(
                    { name: "💰 Economy", value: "economy" },
                    { name: "⭐ Leveling", value: "leveling" },
                    { name: "🔨 Moderation", value: "moderation" },
                    { name: "🎫 Support", value: "support" },
                    { name: "🎉 Giveaways", value: "giveaways" },
                    { name: "🎮 Fun", value: "fun" },
                    { name: "💬 Social", value: "social" },
                )))
        .addSubcommand(sub => sub
            .setName("profile")
            .setDescription("View a user's unlocked achievements")
            .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(false))),

    async execute(interaction) {
        const { achievements } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub === "list") {
            const category = interaction.options.getString("category");
            const all = await achievements.getAll(interaction.guild.id, interaction.user.id);
            const filtered = category ? all.filter(a => a.category === category) : all;

            if (!filtered.length) {
                return interaction.reply({ embeds: [panel("Achievements", "No achievements found.")], flags: MessageFlags.Ephemeral });
            }

            // Group by category
            const grouped = {};
            for (const a of filtered) {
                if (!grouped[a.category]) grouped[a.category] = [];
                grouped[a.category].push(a);
            }

            const lines = [];
            for (const [cat, achs] of Object.entries(grouped)) {
                const icon = CATEGORY_ICONS[cat] ?? "📋";
                lines.push(`\n**${icon} ${cat.charAt(0).toUpperCase() + cat.slice(1)}**`);
                for (const a of achs) {
                    const status = a.unlocked ? "✅" : "🔒";
                    const progress = a.unlocked ? "" : ` (${a.userProgress}/${a.conditions.target})`;
                    lines.push(`${status} ${a.icon ?? ""} **${a.name}**${progress}`);
                    if (a.description) lines.push(`   ${a.description}`);
                }
            }

            const stats = await achievements.getStats(interaction.guild.id);
            const embed = panel("Achievements", lines.join("\n"))
                .setFooter({ text: `${stats.unlocked}/${stats.total} unlocked` });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === "profile") {
            const target = interaction.options.getUser("user") ?? interaction.user;
            const unlocked = await achievements.getUnlocked(interaction.guild.id, target.id);

            if (!unlocked.length) {
                return interaction.reply({ embeds: [panel("Achievements", `${target.tag} hasn't unlocked any achievements yet.`)], flags: MessageFlags.Ephemeral });
            }

            const lines = unlocked.map(ua => {
                const a = ua.achievement;
                const icon = CATEGORY_ICONS[a.category] ?? "📋";
                return `${icon} ${a.icon ?? ""} **${a.name}** — ${a.description ?? ""}`;
            });

            const embed = panel(`${target.tag}'s Achievements`, lines.join("\n"))
                .setThumbnail(target.displayAvatarURL())
                .setFooter({ text: `${unlocked.length} unlocked` });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
