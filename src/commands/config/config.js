import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { requireModerator, ephemeral } from "../moderation/shared.js";
import { panel, success } from "../../design/embeds.js";

const MODULE_LIST = [
    { name: "moderation", label: "Moderation", desc: "Mod commands + case logging" },
    { name: "automod", label: "AutoMod", desc: "Automated content moderation" },
    { name: "leveling", label: "Leveling", desc: "XP and level system" },
    { name: "economy", label: "Economy", desc: "Coins, shop, jobs" },
    { name: "welcome", label: "Welcome", desc: "Join/leave messages" },
    { name: "giveaways", label: "Giveaways", desc: "Giveaway system" },
    { name: "tickets", label: "Tickets", desc: "Support ticket system" },
    { name: "starboard", label: "Starboard", desc: "Star message tracking" },
    { name: "afk", label: "AFK", desc: "AFK status system" },
    { name: "suggestions", label: "Suggestions", desc: "Suggestion system" },
];

export default {
    data: new SlashCommandBuilder()
        .setName("config")
        .setDescription("Server configuration")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName("view").setDescription("View current configuration"))
        .addSubcommand(sub => sub
            .setName("modules")
            .setDescription("Toggle feature modules")
            .addStringOption(o =>
                o.setName("module")
                    .setDescription("Module to toggle")
                    .setRequired(true)
                    .addChoices(...MODULE_LIST.map(m => ({ name: m.label, value: m.name })))
            )
            .addBooleanOption(o => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("logs")
            .setDescription("Set log channels")
            .addStringOption(o =>
                o.setName("type")
                    .setDescription("Channel type")
                    .setRequired(true)
                    .addChoices(
                        { name: "Message logs", value: "log" },
                        { name: "Moderation logs", value: "mod" },
                        { name: "Welcome channel", value: "welcome" },
                        { name: "Goodbye channel", value: "goodbye" },
                    )
            )
            .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("staff")
            .setDescription("Manage staff/moderator roles")
            .addStringOption(o =>
                o.setName("type")
                    .setDescription("Role type")
                    .setRequired(true)
                    .addChoices(
                        { name: "Staff role", value: "staff" },
                        { name: "Moderator role", value: "moderator" },
                    )
            )
            .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("prefix")
            .setDescription("Set command prefix")
            .addStringOption(o => o.setName("prefix").setDescription("New prefix (max 5 chars)").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("botname")
            .setDescription("Set bot display name for this server")
            .addStringOption(o => o.setName("name").setDescription("Bot name (empty to reset)").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("botavatar")
            .setDescription("Set bot avatar for this server")
            .addAttachmentOption(o => o.setName("avatar").setDescription("Avatar image").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("botbanner")
            .setDescription("Set bot banner for this server")
            .addAttachmentOption(o => o.setName("banner").setDescription("Banner image").setRequired(true))
        ),

    async execute(interaction) {
        const { settings } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        if (sub !== "view") {
            const isMod = await requireModerator(interaction);
            if (!isMod) return ephemeral(interaction, "You need Manage Server permission.");
        }

        const config = await settings.get(interaction.guild.id);

        switch (sub) {
            case "view":      return this.handleView(interaction, config);
            case "modules":   return this.handleModules(interaction, settings, config);
            case "logs":      return this.handleLogs(interaction, settings, config);
            case "staff":     return this.handleStaff(interaction, settings, config);
            case "prefix":    return this.handlePrefix(interaction, settings, config);
            case "botname":   return this.handleBotName(interaction);
            case "botavatar": return this.handleBotAvatar(interaction);
            case "botbanner": return this.handleBotBanner(interaction);
        }
    },

    async handleView(interaction, config) {
        const mods = JSON.parse(config.modules);
        const modLines = MODULE_LIST.map(m => {
            const enabled = mods[m.name] !== false;
            return `${enabled ? "●" : "○"} **${m.label}** — ${m.desc}`;
        });

        const embed = panel("Server Configuration", modLines.join("\n"))
            .addFields(
                { name: "Log Channel", value: config.logChannelId ? `<#${config.logChannelId}>` : "Not set", inline: true },
                { name: "Mod Log", value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : "Not set", inline: true },
                { name: "Welcome", value: config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "Not set", inline: true },
                { name: "Goodbye", value: config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : "Not set", inline: true },
                { name: "Staff Roles", value: config.staffRoleIds.length ? config.staffRoleIds.map(id => `<@&${id}>`).join(", ") : "None", inline: true },
                { name: "Mod Roles", value: config.moderatorRoleIds.length ? config.moderatorRoleIds.map(id => `<@&${id}>`).join(", ") : "None", inline: true },
                { name: "Prefix", value: `\`${config.prefix}\``, inline: true },
            );

        await interaction.reply({ embeds: [embed] });
    },

    async handleModules(interaction, settings, config) {
        const module = interaction.options.getString("module");
        const enabled = interaction.options.getBoolean("enabled");

        await settings.setModule(interaction.guild.id, module, enabled);
        const label = MODULE_LIST.find(m => m.name === module)?.label ?? module;

        await interaction.reply({
            embeds: [success("Module Updated", `${label} is now ${enabled ? "enabled" : "disabled"}.`)],
        });
    },

    async handleLogs(interaction, settings, config) {
        const type = interaction.options.getString("type");
        const channel = interaction.options.getChannel("channel");

        const field = {
            log: "logChannelId",
            mod: "modLogChannelId",
            welcome: "welcomeChannelId",
            goodbye: "goodbyeChannelId",
        }[type];

        await settings.patch(interaction.guild.id, { [field]: channel.id });

        const label = { log: "Message logs", mod: "Moderation logs", welcome: "Welcome channel", goodbye: "Goodbye channel" }[type];
        await interaction.reply({
            embeds: [success("Channel Set", `${label} set to <#${channel.id}>`)],
        });
    },

    async handleStaff(interaction, settings, config) {
        const type = interaction.options.getString("type");
        const role = interaction.options.getRole("role");

        const field = type === "staff" ? "staffRoleIds" : "moderatorRoleIds";
        const ids = config[field] || [];
        const idx = ids.indexOf(role.id);

        if (idx >= 0) {
            ids.splice(idx, 1);
        } else {
            ids.push(role.id);
        }

        await settings.patch(interaction.guild.id, { [field]: JSON.stringify(ids) });
        const action = idx >= 0 ? "removed from" : "added to";

        await interaction.reply({
            embeds: [success("Role Updated", `<@&${role.id}> ${action} ${type} roles.`)],
        });
    },

    async handlePrefix(interaction, settings, config) {
        const prefix = interaction.options.getString("prefix");
        if (prefix.length > 5) return ephemeral(interaction, "Prefix must be 5 characters or less.");

        await settings.patch(interaction.guild.id, { prefix });
        await interaction.reply({
            embeds: [success("Prefix Updated", `Prefix set to \`${prefix}\``)],
        });
    },

    async handleBotName(interaction) {
        const { branding } = interaction.client.services;
        const name = interaction.options.getString("name");

        if (!name) {
            // Reset to default
            await branding.set(interaction.guild.id, { nickname: null });
            await interaction.guild.members.me.setNickname(null).catch(() => {});
            return interaction.reply({
                embeds: [success("Bot Name Reset", "Bot name reset to default.")],
            });
        }

        if (name.length > 32) return ephemeral(interaction, "Name must be 32 characters or less.");

        await branding.set(interaction.guild.id, { nickname: name });
        await interaction.guild.members.me.setNickname(name).catch(e => {
            return interaction.reply({ embeds: [success("Name Saved", `Saved as **${name}** but could not apply: ${e.message}`)] });
        });

        await interaction.reply({
            embeds: [success("Bot Name Set", `Bot name set to **${name}**.`)],
        });
    },

    async handleBotAvatar(interaction) {
        const { branding } = interaction.client.services;
        const attachment = interaction.options.getAttachment("avatar");

        if (!attachment.contentType?.startsWith("image/")) {
            return ephemeral(interaction, "File must be an image.");
        }

        await branding.set(interaction.guild.id, { avatarUrl: attachment.url });
        await interaction.reply({
            embeds: [success("Avatar Saved", "Avatar saved for this server. Note: Discord doesn't support per-server bot avatars — this is stored for dashboard/website use.")],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleBotBanner(interaction) {
        const { branding } = interaction.client.services;
        const attachment = interaction.options.getAttachment("banner");

        if (!attachment.contentType?.startsWith("image/")) {
            return ephemeral(interaction, "File must be an image.");
        }

        await branding.set(interaction.guild.id, { bannerUrl: attachment.url });
        await interaction.reply({
            embeds: [success("Banner Saved", "Banner saved for this server. Note: Discord doesn't support per-server bot banners — this is stored for dashboard/website use.")],
            flags: MessageFlags.Ephemeral,
        });
    },
};
