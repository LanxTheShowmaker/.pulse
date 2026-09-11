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
            const c = interaction.client;
            const uptime = this.formatUptime(c.uptime);
            const embed = panel(".pulse", "A professional Discord moderation and management bot.")
                .addFields(
                    { name: "Version", value: "2.0", inline: true },
                    { name: "Servers", value: `${c.guilds.cache.size}`, inline: true },
                    { name: "Users", value: `${c.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toLocaleString()}`, inline: true },
                    { name: "Uptime", value: uptime, inline: true },
                    { name: "Latency", value: `${Math.round(c.ws.ping)}ms`, inline: true },
                    { name: "Library", value: "discord.js", inline: true },
                );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === "uptime") {
            const embed = panel("Uptime", `\`\`\`${this.formatUptime(interaction.client.uptime)}\`\`\``);
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
        const sec = s % 60;
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        parts.push(`${sec}s`);
        return parts.join(" ");
    },
};
