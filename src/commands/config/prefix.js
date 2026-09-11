import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";
import { isStaff } from "../../core/services.js";

export default {
    data: new SlashCommandBuilder()
        .setName("prefix")
        .setDescription("Configure server prefix for traditional commands")
        .addSubcommand(s => s.setName("view").setDescription("View current prefix"))
        .addSubcommand(s => s.setName("set").setDescription("Set new prefix (1-10 chars)").addStringOption(o => o.setName("prefix").setDescription("New prefix, e.g. ! or ? or $").setRequired(true).setMinLength(1).setMaxLength(10)))
        .addSubcommand(s => s.setName("reset").setDescription("Reset to default prefix (!)")),
    category: "Config",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const prefixService = interaction.client.services.prefix;
        
        if (sub === "view") {
            const prefix = await prefixService.getPrefix(guild.id);
            const defaultPrefix = "!";
            const embed = new EmbedBuilder()
                .setColor(Theme.panel)
                .setAuthor({ name: `${guild.name} • Prefix`, iconURL: guild.iconURL() ?? undefined })
                .setTitle("Current Prefix")
                .setDescription(`**Current:** \`${prefix}\`\n**Default:** \`${defaultPrefix}\`\n\nUse \`${prefix}ping\` or \`${prefix} help\` or slash \`/ping\``)
                .addFields(
                    { name: "Slash Equivalent", value: "`/prefix view`", inline: true },
                    { name: "Prefix Equivalent", value: `\`${prefix}prefix\``, inline: true }
                )
                .setFooter({ text: `Prefix is per-server.` })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Check staff for set/reset
        const cfg = await interaction.client.services.settings.get(guild.id).catch(() => null);
        if (!isStaff(interaction.member, cfg)) {
            return interaction.reply({ embeds: [embeds.error("No permission", "Staff only — ManageGuild/Administrator or staff role")], flags: MessageFlags.Ephemeral });
        }

        if (sub === "set") {
            const newPrefix = interaction.options.getString("prefix", true);
            try {
                const clean = await prefixService.setPrefix(guild.id, newPrefix);
                const embed = new EmbedBuilder()
                    .setColor(Theme.success)
                    .setTitle("Prefix Updated")
                    .setDescription(`**New prefix:** \`${clean}\`\n\nTry \`${clean}ping\` or \`${clean}help\``)
                    .setFooter({ text: `Per-server • ${guild.name}` })
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                await interaction.client.services.audit?.log(guild.id, { actorId: interaction.user.id, action: "prefix_set", category: "config", details: { prefix: clean } }).catch(() => {});
                return;
            } catch (e) {
                return interaction.reply({ embeds: [embeds.error("Invalid prefix", e.message)], flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === "reset") {
            try {
                const clean = await prefixService.resetPrefix(guild.id);
                const embed = new EmbedBuilder()
                    .setColor(Theme.success)
                    .setTitle("Prefix Reset")
                    .setDescription(`Reset to default \`${clean}\``)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } catch (e) {
                return interaction.reply({ embeds: [embeds.error("Failed", e.message)], flags: MessageFlags.Ephemeral });
            }
        }
    },
    // For prefix handling, also support direct prefix invocation
    prefixExecute: async (message, args, subcommand, prefix) => {
        // This will be handled by the prefix service's generic handler, but we provide a direct prefix version
        // Usage: !prefix, !prefix set !, !prefix reset, !prefix view
        const guild = message.guild;
        const prefixService = message.client.services.prefix;
        const sub = (args[0] || "view").toLowerCase();
        
        if (sub === "view" || !["set", "reset", "view"].includes(sub)) {
            const current = await prefixService.getPrefix(guild.id);
            return message.reply({ content: `**Current prefix:** \`${current}\` (default \`!\`)\nUse \`${current}prefix set <new>\` or \`${current}prefix reset\``, allowedMentions: { repliedUser: false } });
        }
        
        const cfg = await message.client.services.settings.get(guild.id).catch(() => null);
        if (!isStaff(message.member, cfg)) {
            return message.reply({ content: "Staff only", allowedMentions: { repliedUser: false } });
        }
        
        if (sub === "set") {
            const newPrefix = args[1];
            if (!newPrefix) return message.reply({ content: `Usage: \`${prefix}prefix set <prefix>\``, allowedMentions: { repliedUser: false } });
            try {
                const clean = await prefixService.setPrefix(guild.id, newPrefix);
                return message.reply({ content: `Prefix set to \`${clean}\` — try \`${clean}ping\``, allowedMentions: { repliedUser: false } });
            } catch (e) {
                return message.reply({ content: `${e.message}`, allowedMentions: { repliedUser: false } });
            }
        }
        
        if (sub === "reset") {
            const clean = await prefixService.resetPrefix(guild.id);
            return message.reply({ content: `Reset to \`${clean}\``, allowedMentions: { repliedUser: false } });
        }
    }
};
