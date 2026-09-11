import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";
import { linkButton, row } from "../../design/components.js";

export default {
    data: new SlashCommandBuilder()
        .setName("bot")
        .setDescription("Bot information")
        .addSubcommand(sub => sub.setName("about").setDescription("About .pulse"))
        .addSubcommand(sub => sub.setName("uptime").setDescription("Bot uptime"))
        .addSubcommand(sub => sub.setName("invite").setDescription("Get bot invite link")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === "about") {
            const embed = panel(".pulse", "A professional Discord moderation and management bot.")
                .addFields(
                    { name: "Servers", value: `${interaction.client.guilds.cache.size}`, inline: true },
                    { name: "Uptime", value: this.formatUptime(interaction.client.uptime), inline: true },
                    { name: "Latency", value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true },
                );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === "uptime") {
            await interaction.reply({ content: `Uptime: **${this.formatUptime(interaction.client.uptime)}**`, flags: MessageFlags.Ephemeral });
        }

        if (sub === "invite") {
            const url = `https://discord.com/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands`;
            await interaction.reply({
                components: [row(linkButton("Invite .pulse", url))],
                flags: MessageFlags.Ephemeral,
            });
        }
    },

    formatUptime(ms) {
        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    },
};
