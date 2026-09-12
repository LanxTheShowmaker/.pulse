import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { requireModerator, ephemeral } from "../moderation/shared.js";
import { panel, success, error, stat } from "../../design/embeds.js";

const DETECTOR_LIST = [
    { name: "spam",      label: "Spam Detection",     desc: "Multiple messages in short time" },
    { name: "words",     label: "Banned Words",       desc: "Word filter" },
    { name: "links",     label: "Link Detection",     desc: "URLs in messages" },
    { name: "invites",   label: "Invite Detection",   desc: "Discord invite links" },
    { name: "caps",      label: "Caps Lock",          desc: "Excessive capitalization" },
    { name: "mentions",  label: "Mass Mentions",      desc: "Too many mentions" },
    { name: "emoji",     label: "Emoji Spam",         desc: "Excessive emoji" },
    { name: "duplicate", label: "Duplicate Text",     desc: "Repeated messages" },
];

const ACTION_LIST = [
    { name: "Warn",  value: "warn" },
    { name: "Mute (1m)",  value: "mute" },
    { name: "Kick",  value: "kick" },
    { name: "Ban",   value: "ban" },
];

export default {
    category: "config",
    data: new SlashCommandBuilder()
        .setName("automod")
        .setDescription("Automated moderation configuration")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName("view").setDescription("View automod settings"))
        .addSubcommand(sub => sub
            .setName("toggle")
            .setDescription("Toggle a detector")
            .addStringOption(o =>
                o.setName("detector").setDescription("Detector to toggle").setRequired(true)
                    .addChoices(...DETECTOR_LIST.map(d => ({ name: d.label, value: d.name })))
            )
            .addBooleanOption(o => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("action")
            .setDescription("Set the action for automod violations")
            .addStringOption(o =>
                o.setName("action").setDescription("Action to take").setRequired(true)
                    .addChoices(...ACTION_LIST)
            )
        )
        .addSubcommand(sub => sub
            .setName("threshold")
            .setDescription("Set detector threshold")
            .addStringOption(o =>
                o.setName("detector").setDescription("Detector").setRequired(true)
                    .addChoices(
                        { name: "Spam (messages per 5s)", value: "spam" },
                        { name: "Caps (percentage)", value: "caps" },
                        { name: "Mentions (count)", value: "mentions" },
                        { name: "Emoji (count)", value: "emoji" },
                    )
            )
            .addIntegerOption(o => o.setName("value").setDescription("Threshold value").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("words")
            .setDescription("Manage banned words")
            .addStringOption(o => o.setName("word").setDescription("Word to add/remove").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("exempt")
            .setDescription("Toggle role/channel exemption")
            .addStringOption(o =>
                o.setName("type").setDescription("Exemption type").setRequired(true)
                    .addChoices({ name: "Role", value: "role" }, { name: "Channel", value: "channel" })
            )
            .addStringOption(o => o.setName("id").setDescription("Role or channel ID").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("test").setDescription("Test automod against a message")
            .addStringOption(o => o.setName("message").setDescription("Message to test").setRequired(true))
        ),

    async execute(interaction) {
        const { settings } = interaction.client.services;
        const isMod = await requireModerator(interaction);
        if (!isMod) return ephemeral(interaction, "You need Manage Server permission.");

        const config = await settings.get(interaction.guild.id);
        const ac = config.automod || {};

        switch (interaction.options.getSubcommand()) {
            case "view":      return this.handleView(interaction, ac);
            case "toggle":    return this.handleToggle(interaction, settings, ac);
            case "action":    return this.handleAction(interaction, settings, ac);
            case "threshold": return this.handleThreshold(interaction, settings, ac);
            case "words":     return this.handleWords(interaction, settings, ac);
            case "exempt":    return this.handleExempt(interaction, settings, ac);
            case "test":      return this.handleTest(interaction, ac);
        }
    },

    async handleView(interaction, ac) {
        const detectorFields = DETECTOR_LIST.map(d => {
            const det = ac[d.name] || {};
            const enabled = det.enabled;
            const icon = enabled ? "✅" : "⬜";
            const action = enabled && det.action ? ` → **${det.action}**` : "";
            return stat(`${icon} ${d.label}`, `${d.desc}${action}`);
        });

        const embed = panel("AutoMod Configuration", null)
            .addFields(
                stat("Default Action", `**${ac.action ?? "warn"}**`),
                ...detectorFields,
            );

        if (ac.words?.list?.length) {
            embed.addFields(stat("Banned Words", ac.words.list.map(w => `\`${w}\``).join(", ").slice(0, 1024), false));
        }

        if (ac.exempt?.roles?.length) {
            embed.addFields(stat("Exempt Roles", ac.exempt.roles.map(id => `<@&${id}>`).join(", "), true));
        }

        if (ac.exempt?.channels?.length) {
            embed.addFields(stat("Exempt Channels", ac.exempt.channels.map(id => `<#${id}>`).join(", "), true));
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    async handleToggle(interaction, settings, ac) {
        const detector = interaction.options.getString("detector");
        const enabled = interaction.options.getBoolean("enabled");

        if (!ac[detector]) ac[detector] = {};
        ac[detector].enabled = enabled;

        await settings.patch(interaction.guild.id, { automod: JSON.stringify(ac) });
        const label = DETECTOR_LIST.find(d => d.name === detector)?.label ?? detector;
        const icon = enabled ? "✅" : "⬜";

        await interaction.reply({
            embeds: [success("AutoMod Updated", `${icon} **${label}** is now ${enabled ? "enabled" : "disabled"}.`)],
        });
    },

    async handleAction(interaction, settings, ac) {
        const action = interaction.options.getString("action");
        const oldAction = ac.action ?? "warn";
        ac.action = action;

        await settings.patch(interaction.guild.id, { automod: JSON.stringify(ac) });
        await interaction.reply({
            embeds: [success("AutoMod Updated", `Default action: **${oldAction}** → **${action}**`)],
        });
    },

    async handleThreshold(interaction, settings, ac) {
        const detector = interaction.options.getString("detector");
        const value = interaction.options.getInteger("value");

        if (!ac[detector]) ac[detector] = {};
        const oldThreshold = ac[detector].threshold ?? "default";
        ac[detector].threshold = value;

        await settings.patch(interaction.guild.id, { automod: JSON.stringify(ac) });
        await interaction.reply({
            embeds: [success("AutoMod Updated", `${detector} threshold: **${oldThreshold}** → **${value}**`)],
        });
    },

    async handleWords(interaction, settings, ac) {
        const word = interaction.options.getString("word").toLowerCase();
        if (!ac.words) ac.words = { list: [] };
        if (!ac.words.list) ac.words.list = [];

        const idx = ac.words.list.indexOf(word);
        if (idx >= 0) {
            ac.words.list.splice(idx, 1);
        } else {
            ac.words.list.push(word);
        }

        await settings.patch(interaction.guild.id, { automod: JSON.stringify(ac) });
        const removed = idx >= 0;
        const icon = removed ? "➖" : "➕";

        await interaction.reply({
            embeds: [success("Word List Updated", `${icon} \`${word}\` ${removed ? "removed from" : "added to"} banned words.`)],
        });
    },

    async handleExempt(interaction, settings, ac) {
        const type = interaction.options.getString("type");
        const id = interaction.options.getString("id");

        if (!ac.exempt) ac.exempt = {};
        const list = type === "role" ? (ac.exempt.roles ?? []) : (ac.exempt.channels ?? []);

        const idx = list.indexOf(id);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(id);

        if (type === "role") ac.exempt.roles = list;
        else ac.exempt.channels = list;

        await settings.patch(interaction.guild.id, { automod: JSON.stringify(ac) });
        const removed = idx >= 0;
        const mention = type === "role" ? `<@&${id}>` : `<#${id}>`;
        const icon = removed ? "➖" : "➕";

        await interaction.reply({
            embeds: [success("Exemption Updated", `${icon} ${mention} ${removed ? "removed from" : "added to"} exemptions.`)],
        });
    },

    async handleTest(interaction, ac) {
        const content = interaction.options.getString("message");
        const fake = { content, mentions: { users: { size: (content.match(/@/g) || []).length } } };

        const DETECTOR_FNS = {
            spam:       (m, c) => false,
            words:      (m, c) => (c.words?.list ?? []).some(w => m.content.toLowerCase().includes(w.toLowerCase())),
            links:      (m) => /https?:\/\/[^\s]+/i.test(m.content),
            invites:    (m) => /discord\.gg\/|discordapp\.com\/invite\//i.test(m.content),
            caps:       (m, c) => { const t = c.caps?.threshold ?? 70; const l = m.content.replace(/[^a-zA-Z]/g, ""); return l.length > 10 && (m.content.replace(/[^A-Z]/g, "").length / l.length) * 100 >= t; },
            mentions:   (m, c) => m.mentions.users.size >= (c.mentions?.threshold ?? 5),
            emoji:      (m, c) => { const e = m.content.match(/\p{Emoji_Presentation}/gu); return e && e.length >= (c.emoji?.threshold ?? 10); },
            duplicate:  () => false,
        };

        const results = [];
        for (const [name, fn] of Object.entries(DETECTOR_FNS)) {
            if (!ac[name]?.enabled) continue;
            const triggered = fn(fake, ac);
            results.push({ name, label: DETECTOR_LIST.find(d => d.name === name)?.label ?? name, triggered });
        }

        const lines = results.length
            ? results.map(r => `${r.triggered ? "🔴" : "🟢"} **${r.label}** — ${r.triggered ? "triggered" : "passed"}`)
            : ["No detectors triggered — message is clean."];

        await interaction.reply({
            embeds: [panel("AutoMod Test", lines.join("\n"))],
        });
    },
};
