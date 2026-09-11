import { SlashCommandBuilder, EmbedBuilder } from "@discordjs/builders";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

export default {
    data: new SlashCommandBuilder().setName("bot").setDescription("Bot information and status")
        .addSubcommand(s => s.setName("about").setDescription("About this bot"))
        .addSubcommand(s => s.setName("ping").setDescription("Check latency"))
        .addSubcommand(s => s.setName("uptime").setDescription("Bot uptime"))
        .addSubcommand(s => s.setName("health").setDescription("Quick health check"))
        .addSubcommand(s => s.setName("invite").setDescription("Invite link")),
    category: "Utility",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const client = interaction.client;

        if (sub === "about") {
            const branding = await client.services.branding?.get(interaction.guildId).catch(() => null);
            const name = branding?.nickname || branding?.displayName || client.user.username;
            const embed = new EmbedBuilder().setColor(Theme.panel).setAuthor({ name: `${name}`, iconURL: client.user.displayAvatarURL() })
                .setTitle("About .pulse")
                .setDescription("A modular Discord server management bot.")
                .addFields(
                    { name: "Features", value: "Tickets, Moderation, AutoMod, Leveling, Economy, Automation, Giveaways, Suggestions", inline: false },
                    { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
                    { name: "Uptime", value: formatUptime(client.uptime), inline: true },
                    { name: "Help", value: "Use `/help` to browse commands.", inline: false }
                ).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "ping") {
            const start = Date.now();
            await interaction.deferReply().catch(() => {});
            const latency = Date.now() - start;
            const gateway = client.ws.ping;
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle("Pong")
                .addFields(
                    { name: "API", value: `${latency}ms`, inline: true },
                    { name: "Gateway", value: `${gateway}ms`, inline: true },
                    { name: "Uptime", value: formatUptime(client.uptime), inline: true }
                ).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === "uptime") {
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle("Uptime").setDescription(`Bot has been running for **${formatUptime(client.uptime)}**`).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === "health") {
            await interaction.deferReply().catch(() => {});
            let status = "OK";
            const checks = [];
            try { await client.services.diagnostics?.health(interaction.guildId); checks.push({ name: "Services", status: "OK" }); } catch { status = "ERROR"; checks.push({ name: "Services", status: "ERROR" }); }
            const mem = process.memoryUsage();
            const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
            checks.push({ name: "Memory", status: heapMB < 500 ? "OK" : heapMB < 1000 ? "WARNING" : "ERROR", detail: `${heapMB}MB` });
            checks.push({ name: "Guilds", status: "OK", detail: `${client.guilds.cache.size}` });
            const color = status === "OK" ? Theme.success : status === "WARNING" ? Theme.gold : Theme.error;
            const embed = new EmbedBuilder().setColor(color).setTitle(`Health — ${status}`)
                .setDescription(checks.map(c => `${c.status === "OK" ? "\u2705" : c.status === "WARNING" ? "\u26a0\ufe0f" : "\u274c"} **${c.name}** — ${c.detail || c.status}`).join("\n")).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === "invite") {
            const embed = new EmbedBuilder().setColor(Theme.panel).setTitle("Invite .pulse").setDescription(`[Click to invite](https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands)`).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }
    }
};

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}
