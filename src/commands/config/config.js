import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { requireModerator, ephemeral } from "../moderation/shared.js";
import { panel, success, error, stat } from "../../design/embeds.js";

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
    category: "config",
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
            .addAttachmentOption(o => o.setName("avatar").setDescription("Avatar image file").setRequired(false))
            .addStringOption(o => o.setName("url").setDescription("Avatar image URL").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("botbanner")
            .setDescription("Set bot banner for this server")
            .addAttachmentOption(o => o.setName("banner").setDescription("Banner image file").setRequired(false))
            .addStringOption(o => o.setName("url").setDescription("Banner image URL").setRequired(false))
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
        const enabledCount = MODULE_LIST.filter(m => mods[m.name] !== false).length;

        const branding = await interaction.client.services.branding.get(interaction.guild.id);

        const embed = panel("Server Configuration", null)
            .addFields(
                stat("Modules", `${enabledCount}/${MODULE_LIST.length} enabled`),
                stat("Log Channel", config.logChannelId ? `<#${config.logChannelId}>` : "Not set"),
                stat("Mod Log", config.modLogChannelId ? `<#${config.modLogChannelId}>` : "Not set"),
                stat("Welcome", config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "Not set"),
                stat("Goodbye", config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : "Not set"),
                stat("Staff Roles", config.staffRoleIds.length ? config.staffRoleIds.map(id => `<@&${id}>`).join(", ") : "None"),
                stat("Mod Roles", config.moderatorRoleIds.length ? config.moderatorRoleIds.map(id => `<@&${id}>`).join(", ") : "None"),
                stat("Prefix", `\`${config.prefix}\``),
            );

        if (branding?.nickname) {
            embed.addFields(stat("Bot Name", `**${branding.nickname}**`));
        }

        await interaction.reply({ embeds: [embed] });
    },

    async handleModules(interaction, settings, config) {
        const module = interaction.options.getString("module");
        const enabled = interaction.options.getBoolean("enabled");

        await settings.setModule(interaction.guild.id, module, enabled);
        const label = MODULE_LIST.find(m => m.name === module)?.label ?? module;

        const updatedConfig = await settings.get(interaction.guild.id);
        const mods = JSON.parse(updatedConfig.modules);
        const summary = MODULE_LIST.map(m => {
            const on = mods[m.name] !== false;
            return `${on ? "●" : "○"} **${m.label}**`;
        }).join(" · ");

        await interaction.reply({
            embeds: [success("Module Updated", `${label} is now ${enabled ? "enabled" : "disabled"}.\n\n${summary}`)],
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
        const oldId = config[field];
        const oldChannel = oldId ? `<#${oldId}>` : "Not set";

        await interaction.reply({
            embeds: [success("Channel Set", `${label}: ${oldChannel} → <#${channel.id}>`)],
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
        const added = idx < 0;
        const emoji = added ? "➕" : "➖";

        await interaction.reply({
            embeds: [success("Role Updated", `${emoji} <@&${role.id}> ${added ? "added to" : "removed from"} ${type} roles.`)],
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

        const currentName = interaction.guild.members.me.nickname;
        const oldDisplay = currentName || "Default";

        await branding.set(interaction.guild.id, { nickname: name });

        const nicknameErr = await interaction.guild.members.me.setNickname(name).catch(e => e);
        if (nicknameErr) {
            return interaction.reply({
                embeds: [success("Name Saved", `Saved as **${name}** but could not apply: ${nicknameErr.message}`)],
            });
        }

        await interaction.reply({
            embeds: [success("Bot Name Set", `Bot name: **${oldDisplay}** → **${name}**`)],
        });
    },

    async handleBotAvatar(interaction) {
        const { branding } = interaction.client.services;
        const attachment = interaction.options.getAttachment("avatar");
        const urlOption = interaction.options.getString("url");

        const imageUrl = attachment?.url || urlOption;
        if (!imageUrl) {
            return ephemeral(interaction, "Provide an image file or a URL.");
        }

        // Validate URL format
        let parsedUrl;
        try {
            parsedUrl = new URL(imageUrl);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
        } catch {
            return ephemeral(interaction, "Invalid URL. Must start with `http://` or `https://`.");
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Fetch image and convert to base64 data URI for Discord API
            const resp = await fetch(imageUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const contentType = resp.headers.get("content-type") || "";
            const buf = Buffer.from(await resp.arrayBuffer());

            // Guess extension from content-type or URL
            let ext = "png";
            if (contentType.includes("jpeg") || contentType.includes("jpg") || imageUrl.match(/\.jpe?g/i)) ext = "jpeg";
            else if (contentType.includes("gif") || imageUrl.match(/\.gif/i)) ext = "gif";
            else if (contentType.includes("webp") || imageUrl.match(/\.webp/i)) ext = "webp";

            const b64 = `data:image/${ext};base64,${buf.toString("base64")}`;

            const { REST } = await import("discord.js");
            const rest = new REST().setToken(interaction.client.token);
            await rest.patch(`/guilds/${interaction.guild.id}/members/@me`, {
                body: { avatar: b64 },
            });

            await branding.set(interaction.guild.id, { avatarUrl: imageUrl });
            await interaction.editReply({ embeds: [success("Bot Avatar Set", `Avatar updated for **${interaction.guild.name}**.`)] });
        } catch (e) {
            await branding.set(interaction.guild.id, { avatarUrl: imageUrl });
            await interaction.editReply({ embeds: [error("Failed", `Saved to DB but could not apply: ${e.message}`)] });
        }
    },

    async handleBotBanner(interaction) {
        const { branding } = interaction.client.services;
        const attachment = interaction.options.getAttachment("banner");
        const urlOption = interaction.options.getString("url");

        const imageUrl = attachment?.url || urlOption;
        if (!imageUrl) {
            return ephemeral(interaction, "Provide an image file or a URL.");
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(imageUrl);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
        } catch {
            return ephemeral(interaction, "Invalid URL. Must start with `http://` or `https://`.");
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const contentType = resp.headers.get("content-type") || "";
            const buf = Buffer.from(await resp.arrayBuffer());

            let ext = "png";
            if (contentType.includes("jpeg") || contentType.includes("jpg") || imageUrl.match(/\.jpe?g/i)) ext = "jpeg";
            else if (contentType.includes("gif") || imageUrl.match(/\.gif/i)) ext = "gif";
            else if (contentType.includes("webp") || imageUrl.match(/\.webp/i)) ext = "webp";

            const b64 = `data:image/${ext};base64,${buf.toString("base64")}`;

            const { REST } = await import("discord.js");
            const rest = new REST().setToken(interaction.client.token);
            await rest.patch(`/guilds/${interaction.guild.id}/members/@me`, {
                body: { banner: b64 },
            });

            await branding.set(interaction.guild.id, { bannerUrl: imageUrl });
            await interaction.editReply({ embeds: [success("Bot Banner Set", `Banner updated for **${interaction.guild.name}**.`)] });
        } catch (e) {
            await branding.set(interaction.guild.id, { bannerUrl: imageUrl });
            await interaction.editReply({ embeds: [error("Failed", `Saved to DB but could not apply: ${e.message}`)] });
        }
    },
};
