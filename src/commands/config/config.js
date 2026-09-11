import { SlashCommandBuilder, SelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, EmbedBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits, ChannelType, TextInputStyle, ButtonStyle, ChannelSelectMenuComponent, RoleSelectMenuComponent } from "discord.js";
import { containerReply, containerEdit, createContainer, createActionRow, divider, headerText, bodyText, mutedText, spacer } from "../../design/containers/base.js";
import { settingsMainPanel, moduleTogglePanel, automodConfigPanel, logChannelsPanel, staffRolesPanel, prefixPanel } from "../../design/containers/settings.js";
import { errorPanel, successPanel, infoPanel } from "../../design/containers/panels.js";
import { embeds, confirmationRow } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";
import { isStaff } from "../../core/services.js";
import { logger } from "../../core/logger.js";

// ── Modules list (from modules.js) ──
const ALL = ["moderation", "automod", "tickets", "leveling", "economy", "welcome", "starboard", "reactionRoles", "analytics", "achievements", "automation", "giveaways", "suggestions", "afk"];

// ── Settings categories (from settings.js) ──
const SETTINGS_CATEGORIES = [
    { value: "logging", label: "Logging", description: "Log & mod-log channels" },
    { value: "moderation", label: "Moderation", description: "Prefix, case behavior" },
    { value: "welcome", label: "Welcome & Goodbye", description: "Join/leave channels" },
    { value: "orders", label: "Orders", description: "Design order system" },
    { value: "automod", label: "Automod", description: "Filters & thresholds" },
    { value: "general", label: "General", description: "Overview & roles" },
];

// ── AutoSetup constants (from autosetup.js) ──
const selections = new Map();
function selKey(guildId, userId) { return `${guildId}:${userId}`; }
const STAFF_KEYWORDS = ["staff", "staffs", "administrator", "admin", "management", "manager"];
const MOD_KEYWORDS = ["moderator", "moderators", "mod", "moderation", "support"];
const LOGS_CHANNEL_CANDIDATES = ["server-log", "server-logs", "pulse-log", "pulse-logs", "bot-logs", "logs", "server-logs"];
const MODLOG_CHANNEL_CANDIDATES = ["server-modlog", "server-mod-log", "server-modlogs", "pulse-modlog", "mod-log", "modlog", "modlogs", "moderation-logs", "moderator-logs"];
const WELCOME_CHANNEL_CANDIDATES = ["server-welcome", "pulse-welcome", "welcome", "welcomes", "server-welcome"];
const ORDERS_CATEGORY_CANDIDATES = ["design-orders", "orders", "commissions", "commission-orders"];
const LOGS_CATEGORY_CANDIDATES = ["server logs", "pulse logs", "logs"];
const NEW_STAFF_ROLE = "Server staff";
const NEW_MOD_ROLE = "Server Moderator";
const NEW_LOGS_CATEGORY = "Server Logs";
const NEW_ORDERS_CATEGORY = "design-orders";
const NEW_LOG_CHANNEL = "server-log";
const NEW_MODLOG_CHANNEL = "server-modlog";
const NEW_WELCOME_CHANNEL = "server-welcome";

// ── AutoSetup helpers (from autosetup.js) ──
function normalizeRoleName(name) { return name.toLowerCase().trim().replace(/\s+/g, " "); }
function normalizeChannelName(name) { return name.toLowerCase().trim().replace(/[_]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-"); }
function roleOptions(guild) {
    return guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id).sort((a, b) => b.position - a.position).first(24).map((r) => ({ label: r.name.slice(0, 80), value: r.id }));
}
function scoreRoleAgainstKeywords(roleName, keywords) {
    const norm = normalizeRoleName(roleName);
    const tokens = norm.split(" ");
    let best = 0;
    for (const kw of keywords) {
        const k = kw.toLowerCase();
        if (norm === k) best = Math.max(best, 100);
        else if (tokens.length <= 2 && tokens.includes(k)) best = Math.max(best, 60);
    }
    return best;
}
function findMatchingRole(guild, keywords) {
    let bestRole = null, bestScore = 0;
    for (const role of guild.roles.cache.values()) {
        if (role.managed || role.id === guild.id) continue;
        const score = scoreRoleAgainstKeywords(role.name, keywords);
        if (score > bestScore) { bestScore = score; bestRole = role; }
        else if (score === bestScore && bestRole && score > 0 && role.position > bestRole.position) bestRole = role;
    }
    return bestScore > 0 ? bestRole : null;
}
function detectStaffRole(guild) { return findMatchingRole(guild, STAFF_KEYWORDS); }
function detectModeratorRole(guild) { return findMatchingRole(guild, MOD_KEYWORDS); }
function findMatchingChannel(guild, candidates, type = ChannelType.GuildText) {
    const normalizedCandidates = candidates.map((c) => normalizeChannelName(c));
    for (const cand of normalizedCandidates) {
        for (const ch of guild.channels.cache.values()) {
            if (ch.type !== type) continue;
            if (normalizeChannelName(ch.name) === cand) return ch;
        }
    }
    return null;
}
function findMatchingCategory(guild, candidates) {
    const norms = candidates.map((c) => c.toLowerCase().trim());
    for (const cand of norms) {
        for (const ch of guild.channels.cache.values()) {
            if (ch.type !== ChannelType.GuildCategory) continue;
            if (ch.name.toLowerCase().trim() === cand) return ch;
        }
    }
    return null;
}
function validateSetupPermissions(guild) {
    const me = guild.members.me;
    if (!me) return { canManageRoles: false, canManageChannels: false, warnings: ["Bot member not cached"] };
    const canManageRoles = me.permissions.has(PermissionFlagsBits.ManageRoles);
    const canManageChannels = me.permissions.has(PermissionFlagsBits.ManageChannels);
    const warnings = [];
    if (!canManageRoles) warnings.push("Missing **Manage Roles**");
    if (!canManageChannels) warnings.push("Missing **Manage Channels**");
    return { canManageRoles, canManageChannels, warnings };
}
function validateRoleHierarchy(guild, roleIds) {
    const me = guild.members.me;
    if (!me) return { ok: false, problems: roleIds.map((id) => ({ id, reason: "Bot not cached" })) };
    const highest = me.roles.highest;
    const problems = [];
    for (const id of roleIds) {
        const role = guild.roles.cache.get(id);
        if (!role) continue;
        if (role.position >= highest.position) problems.push({ id, name: role.name, reason: `Role @${role.name} is above or equal to bot's highest role (@${highest.name})` });
        if (role.managed) problems.push({ id, name: role.name, reason: `Role @${role.name} is managed/integration` });
    }
    return { ok: problems.length === 0, problems };
}
async function ensureCategory(guild, name) {
    const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    return guild.channels.create({ name, type: ChannelType.GuildCategory });
}
async function ensureTextChannel(guild, name, parent, overwrites = []) {
    const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === name.toLowerCase() && (parent ? c.parentId === parent.id : !c.parentId));
    if (existing) return existing;
    return guild.channels.create({ name, type: ChannelType.GuildText, parent: parent?.id, permissionOverwrites: overwrites });
}
async function hideFromMembers(guild, target, allowRoleIds) {
    await target.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => {});
    for (const id of allowRoleIds) {
        await target.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    }
}
async function buildSetupPlan(guild, sel, config, opts = {}) {
    const { repairMode = false } = opts;
    const plan = {
        roles: { staff: null, mod: null },
        categories: { logs: null, orders: null },
        channels: { log: null, modLog: null, welcome: null },
        permissions: validateSetupPermissions(guild),
        hierarchy: { staff: null, mod: null },
        configRecovery: [],
        actions: [],
    };
    const detectedStaff = detectStaffRole(guild);
    const detectedMod = detectModeratorRole(guild);
    const staffId = sel.staff[0];
    if (staffId) {
        const role = guild.roles.cache.get(staffId);
        plan.roles.staff = { action: role ? "reuse" : "repair", roleId: staffId, name: role?.name ?? staffId, source: "selected" };
        if (!role) {
            const repl = detectedStaff;
            if (repl) { plan.roles.staff = { action: "repair", roleId: repl.id, name: repl.name, source: "detected-recovery" }; plan.configRecovery.push(`Staff ${staffId} → ${repl.id}`); }
            else if (sel.createMissing && plan.permissions.canManageRoles) plan.roles.staff = { action: "create", name: NEW_STAFF_ROLE, source: "createMissing" };
            else plan.roles.staff = { action: "blocked", reason: "Selected role missing and create disabled" };
        }
    } else if (detectedStaff) plan.roles.staff = { action: "reuse", roleId: detectedStaff.id, name: detectedStaff.name, source: "detected" };
    else if (sel.createMissing && plan.permissions.canManageRoles) plan.roles.staff = { action: "create", name: NEW_STAFF_ROLE, source: "createMissing" };
    else plan.roles.staff = { action: "skip", reason: "No Staff role selected or detected" };
    const modId = sel.mod[0];
    if (modId) {
        const role = guild.roles.cache.get(modId);
        plan.roles.mod = { action: role ? "reuse" : "repair", roleId: modId, name: role?.name ?? modId, source: "selected" };
        if (!role) {
            const repl = detectedMod;
            if (repl) { plan.roles.mod = { action: "repair", roleId: repl.id, name: repl.name, source: "detected-recovery" }; plan.configRecovery.push(`Mod ${modId} → ${repl.id}`); }
            else if (sel.createMissing && plan.permissions.canManageRoles) plan.roles.mod = { action: "create", name: NEW_MOD_ROLE, source: "createMissing" };
            else plan.roles.mod = { action: "blocked", reason: "Selected role missing" };
        }
    } else if (detectedMod) plan.roles.mod = { action: "reuse", roleId: detectedMod.id, name: detectedMod.name, source: "detected" };
    else if (sel.createMissing && plan.permissions.canManageRoles) plan.roles.mod = { action: "create", name: NEW_MOD_ROLE, source: "createMissing" };
    else plan.roles.mod = { action: "skip", reason: "No Moderator role selected" };
    const toCheck = [plan.roles.staff?.roleId, plan.roles.mod?.roleId].filter(Boolean);
    if (toCheck.length) plan.hierarchy = validateRoleHierarchy(guild, toCheck);
    let logsCat = findMatchingCategory(guild, LOGS_CATEGORY_CANDIDATES);
    if (logsCat) plan.categories.logs = { action: "reuse", id: logsCat.id, name: logsCat.name };
    else plan.categories.logs = { action: plan.permissions.canManageChannels ? "create" : "blocked", name: NEW_LOGS_CATEGORY };
    let ordersCat = findMatchingCategory(guild, ORDERS_CATEGORY_CANDIDATES);
    if (ordersCat) plan.categories.orders = { action: "reuse", id: ordersCat.id, name: ordersCat.name };
    else plan.categories.orders = { action: plan.permissions.canManageChannels ? "create" : "blocked", name: NEW_ORDERS_CATEGORY };
    function resolveChannel(planKey, candidates, configKey, newName, parentPlan) {
        const cfgId = config?.[configKey];
        if (cfgId) {
            const ch = guild.channels.cache.get(cfgId) ?? null;
            if (ch && ch.type === ChannelType.GuildText) {
                if (parentPlan && parentPlan.id && ch.parentId !== parentPlan.id && ch.parentId !== null) {
                    if (repairMode) plan.channels[planKey] = { action: "repair", id: ch.id, name: ch.name, reason: "Wrong category" };
                    else plan.channels[planKey] = { action: "reuse", id: ch.id, name: ch.name };
                    return;
                }
                plan.channels[planKey] = { action: "reuse", id: ch.id, name: ch.name };
                return;
            } else if (ch === null) plan.configRecovery.push(`${configKey} ${cfgId} deleted`);
        }
        const found = findMatchingChannel(guild, candidates, ChannelType.GuildText);
        if (found) { plan.channels[planKey] = { action: cfgId ? "repair" : "reuse", id: found.id, name: found.name }; return; }
        plan.channels[planKey] = { action: plan.permissions.canManageChannels ? "create" : "blocked", name: newName };
    }
    resolveChannel("log", LOGS_CHANNEL_CANDIDATES, "logChannelId", NEW_LOG_CHANNEL, plan.categories.logs.action === "reuse" ? { id: plan.categories.logs.id } : null);
    resolveChannel("modLog", MODLOG_CHANNEL_CANDIDATES, "modLogChannelId", NEW_MODLOG_CHANNEL, plan.categories.logs.action === "reuse" ? { id: plan.categories.logs.id } : null);
    resolveChannel("welcome", WELCOME_CHANNEL_CANDIDATES, "welcomeChannelId", NEW_WELCOME_CHANNEL, null);
    if (repairMode && config && logsCat) {
        const overw = logsCat.permissionOverwrites.cache;
        const everyone = overw.get(guild.roles.everyone.id);
        const needsRepair = !everyone || everyone.allow.has(PermissionFlagsBits.ViewChannel);
        if (needsRepair && plan.permissions.canManageChannels) plan.categories.logs.repairPerms = true;
    }
    return plan;
}
async function executePlan(guild, plan, client) {
    const results = { roles: {}, categories: {}, channels: {}, config: null };
    for (const key of ["staff", "mod"]) {
        const r = plan.roles[key];
        if (!r) continue;
        if (r.action === "create") {
            try {
                const created = await guild.roles.create({ name: r.name, reason: "autosetup" });
                const me = guild.members.me;
                if (me && created.position >= me.roles.highest.position) await created.setPosition(me.roles.highest.position - 1).catch(() => {});
                results.roles[key] = { id: created.id, name: created.name, action: "created" };
                r.roleId = created.id;
            } catch (e) { logger.error("autosetup", `create ${key} failed`, e); results.roles[key] = { action: "blocked", reason: String(e.message).slice(0, 100) }; }
        } else if (r.action === "reuse" || r.action === "repair") results.roles[key] = { id: r.roleId, name: r.name, action: r.action === "repair" ? "repaired" : "reused" };
        else results.roles[key] = { action: r.action };
    }
    for (const key of ["logs", "orders"]) {
        const c = plan.categories[key];
        if (!c) continue;
        if (c.action === "reuse") { const ch = guild.channels.cache.get(c.id); results.categories[key] = { id: ch?.id, name: ch?.name ?? c.name, action: "reused" }; }
        else if (c.action === "create") {
            try {
                const created = await ensureCategory(guild, c.name);
                const isNew = created.name === c.name && created.createdAt && Date.now() - created.createdAt.getTime() < 5000;
                results.categories[key] = { id: created.id, name: created.name, action: isNew ? "created" : "reused" };
            } catch (e) { logger.error("autosetup", `create cat ${key} failed`, e); results.categories[key] = { action: "blocked" }; }
        } else results.categories[key] = { action: c.action };
    }
    const allowIds = [results.roles.staff?.id, results.roles.mod?.id].filter(Boolean);
    const allAllow = [...new Set([...allowIds, ...[plan.roles.staff?.roleId, plan.roles.mod?.roleId].filter(Boolean)])];
    for (const key of ["log", "modLog", "welcome"]) {
        const chPlan = plan.channels[key];
        if (!chPlan) continue;
        const parentForLog = key === "welcome" ? null : (results.categories.logs?.id ? guild.channels.cache.get(results.categories.logs.id) : null);
        const overwrites = key === "welcome" ? [] : [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            ...allAllow.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
        ];
        if (chPlan.action === "reuse" || chPlan.action === "repair") {
            const ch = guild.channels.cache.get(chPlan.id);
            if (ch) {
                if (key !== "welcome" && allAllow.length) {
                    await hideFromMembers(guild, ch.parentId ? guild.channels.cache.get(ch.parentId) ?? ch : ch, allAllow).catch(() => {});
                    if (ch.parentId !== parentForLog?.id && parentForLog) await ch.setParent(parentForLog.id).catch(() => {});
                }
                results.channels[key] = { id: ch.id, name: ch.name, action: chPlan.action === "repair" ? "repaired" : "reused" };
            } else {
                try { const created = await ensureTextChannel(guild, chPlan.name, parentForLog, overwrites); results.channels[key] = { id: created.id, name: created.name, action: "created" }; }
                catch (e) { results.channels[key] = { action: "blocked" }; }
            }
        } else if (chPlan.action === "create") {
            try { const created = await ensureTextChannel(guild, chPlan.name, parentForLog, overwrites); results.channels[key] = { id: created.id, name: created.name, action: "created" }; }
            catch (e) { logger.error("autosetup", `create ch ${key} failed`, e); results.channels[key] = { action: "blocked" }; }
        } else results.channels[key] = { action: chPlan.action };
    }
    if (results.categories.logs?.id && allAllow.length) {
        const cat = guild.channels.cache.get(results.categories.logs.id);
        if (cat) await hideFromMembers(guild, cat, allAllow).catch((e) => logger.error("autosetup", "cat hide failed", e));
    }
    const patch = {};
    if (results.roles.staff?.id) patch.staffRoleIds = [results.roles.staff.id];
    else if (plan.roles.staff?.roleId) patch.staffRoleIds = [plan.roles.staff.roleId];
    if (results.roles.mod?.id) patch.moderatorRoleIds = [results.roles.mod.id];
    else if (plan.roles.mod?.roleId) patch.moderatorRoleIds = [plan.roles.mod.roleId];
    if (results.channels.log?.id) patch.logChannelId = results.channels.log.id;
    else if (plan.channels.log?.id) patch.logChannelId = plan.channels.log.id;
    if (results.channels.modLog?.id) patch.modLogChannelId = results.channels.modLog.id;
    else if (plan.channels.modLog?.id) patch.modLogChannelId = plan.channels.modLog.id;
    if (results.channels.welcome?.id) { patch.welcomeChannelId = results.channels.welcome.id; patch.goodbyeChannelId = results.channels.welcome.id; }
    else if (plan.channels.welcome?.id) { patch.welcomeChannelId = plan.channels.welcome.id; patch.goodbyeChannelId = plan.channels.welcome.id; }
    try { await client.services.settings.patch(guild.id, patch); results.config = { action: "saved" }; }
    catch (e) { logger.error("autosetup", "patch failed", e); results.config = { action: "blocked", reason: String(e.message).slice(0, 100) }; }
    return results;
}
function renderSetup(guild, userId) {
    const sel = selections.get(selKey(guild.id, userId)) ?? { staff: [], mod: [], createMissing: false };
    const staffOpts = roleOptions(guild);
    const modOpts = roleOptions(guild);
    if (!staffOpts.length) staffOpts.push({ label: "No roles found", value: "none", description: "Create a role first" });
    if (!modOpts.length) modOpts.push({ label: "No roles found", value: "none", description: "Create a role first" });
    const staffMenu = new SelectMenuBuilder().setCustomId("pulse:setup:staff").setPlaceholder("Select Staff role").addOptions(staffOpts);
    const modMenu = new SelectMenuBuilder().setCustomId("pulse:setup:mod").setPlaceholder("Select Moderator role").addOptions(modOpts);
    const toggle = new ButtonBuilder().setCustomId("pulse:setup:toggleCreate").setLabel(`Create missing: ${sel.createMissing ? "On" : "Off"}`).setStyle(sel.createMissing ? ButtonStyle.Success : ButtonStyle.Secondary);
    const previewBtn = new ButtonBuilder().setCustomId("pulse:setup:preview").setLabel("Preview").setStyle(ButtonStyle.Secondary);
    const repairBtn = new ButtonBuilder().setCustomId("pulse:setup:repair").setLabel("Repair").setStyle(ButtonStyle.Secondary);
    const confirm = new ButtonBuilder().setCustomId("pulse:setup:confirm").setLabel("Run Setup").setStyle(ButtonStyle.Success);
    const detectedStaff = detectStaffRole(guild);
    const detectedMod = detectModeratorRole(guild);
    const logsCh = findMatchingChannel(guild, LOGS_CHANNEL_CANDIDATES);
    const modlogCh = findMatchingChannel(guild, MODLOG_CHANNEL_CANDIDATES);
    const welcomeCh = findMatchingChannel(guild, WELCOME_CHANNEL_CANDIDATES);
    const logsCat = findMatchingCategory(guild, LOGS_CATEGORY_CANDIDATES);
    const ordersCat = findMatchingCategory(guild, ORDERS_CATEGORY_CANDIDATES);
    const perms = validateSetupPermissions(guild);
    const permWarnings = perms.warnings.length ? perms.warnings.map((w) => `> ${w}`).join("\n") : "> All permissions granted.";
    const embed = embeds.panel("Auto-setup", "Select Staff and Moderator roles, then preview and run setup.", [
        { name: "Staff", value: sel.staff.length ? sel.staff.map((id) => `<@&${id}>`).join(", ") : detectedStaff ? `> Detected: <@&${detectedStaff.id}>` : "> No Staff role selected. Select one below.", inline: true },
        { name: "Moderator", value: sel.mod.length ? sel.mod.map((id) => `<@&${id}>`).join(", ") : detectedMod ? `> Detected: <@&${detectedMod.id}>` : "> No Moderator role selected. Select one below.", inline: true },
        { name: "Create missing", value: sel.createMissing ? "```diff\n+ On  —  will create Server staff / Moderator if missing\n```" : "```diff\n- Off\n```", inline: true },
        { name: "Channels", value: [logsCh ? `> Logs — <#${logsCh.id}>` : `> Logs — \`#${NEW_LOG_CHANNEL}\` (will create)`, modlogCh ? `> Mod-log — <#${modlogCh.id}>` : `> Mod-log — \`#${NEW_MODLOG_CHANNEL}\` (will create)`, welcomeCh ? `> Welcome — <#${welcomeCh.id}>` : `> Welcome — \`#${NEW_WELCOME_CHANNEL}\` (will create)`].join("\n"), inline: false },
        { name: "Categories", value: [logsCat ? `> ${logsCat.name}` : `> ${NEW_LOGS_CATEGORY} (will create)`, ordersCat ? `> ${ordersCat.name}` : `> ${NEW_ORDERS_CATEGORY} (will create)`].join("\n"), inline: true },
        { name: "Permissions", value: permWarnings, inline: false },
    ], { author: { name: `${guild.name}`, iconURL: guild.iconURL({ size: 64 }) ?? undefined }, footer: `${guild.memberCount} members` });
    embed.setThumbnail(guild.iconURL({ size: 128 }) ?? null);
    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(staffMenu), new ActionRowBuilder().addComponents(modMenu), new ActionRowBuilder().addComponents(toggle, previewBtn, repairBtn), new ActionRowBuilder().addComponents(confirm)],
    };
}
function renderPreview(guild, plan) {
    const embed = embeds.panel("Setup Preview", "Review planned changes before building.", [
        { name: "Roles", value: [plan.roles.staff.action === "reuse" ? `> Reuse <@&${plan.roles.staff.roleId}>` : plan.roles.staff.action === "create" ? `> Create \`${plan.roles.staff.name}\`` : plan.roles.staff.action === "repair" ? `> Repair <@&${plan.roles.staff.roleId}>` : `> Staff: ${plan.roles.staff.reason || "skip"}`, plan.roles.mod.action === "reuse" ? `> Reuse <@&${plan.roles.mod.roleId}>` : plan.roles.mod.action === "create" ? `> Create \`${plan.roles.mod.name}\`` : plan.roles.mod.action === "repair" ? `> Repair <@&${plan.roles.mod.roleId}>` : `> Mod: ${plan.roles.mod.reason || "skip"}`].join("\n"), inline: false },
        { name: "Channels", value: [plan.channels.log.action === "reuse" ? `> Reuse <#${plan.channels.log.id}>` : plan.channels.log.action === "repair" ? `> Repair <#${plan.channels.log.id}>` : plan.channels.log.action === "create" ? `> Create \`#${plan.channels.log.name}\`` : `> Logs: blocked`, plan.channels.modLog.action === "reuse" ? `> Reuse <#${plan.channels.modLog.id}>` : plan.channels.modLog.action === "repair" ? `> Repair <#${plan.channels.modLog.id}>` : plan.channels.modLog.action === "create" ? `> Create \`#${plan.channels.modLog.name}\`` : `> Mod-log: blocked`, plan.channels.welcome.action === "reuse" ? `> Reuse <#${plan.channels.welcome.id}>` : plan.channels.welcome.action === "create" ? `> Create \`#${plan.channels.welcome.name}\`` : `> Welcome: blocked`].join("\n"), inline: false },
        { name: "Categories", value: [plan.categories.logs.action === "reuse" ? `> Reuse \`${plan.categories.logs.name}\`` : plan.categories.logs.action === "create" ? `> Create \`${plan.categories.logs.name}\`` : `> Logs category: blocked`, plan.categories.orders.action === "reuse" ? `> Reuse \`${plan.categories.orders.name}\`` : plan.categories.orders.action === "create" ? `> Create \`${plan.categories.orders.name}\`` : `> Orders category: blocked`].join("\n"), inline: false },
        { name: "Configuration", value: "> Guild configuration will be updated", inline: false },
        ...(plan.permissions.warnings.length ? [{ name: "Warnings", value: plan.permissions.warnings.map((w) => `> ${w}`).join("\n") }] : []),
        ...(plan.hierarchy && !plan.hierarchy.ok ? [{ name: "Hierarchy", value: plan.hierarchy.problems.map((p) => `> ${p.reason}`).join("\n") }] : []),
    ], { footer: `No changes made.` });
    embed.setThumbnail(guild.iconURL({ size: 128 }) ?? null);
    const back = new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary);
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(back)] };
}

// ── Settings renderCategory helper (from settings.js) ──
function settingsMainEmbed(config) {
    return embeds.info("Server Settings", "Select a category to configure.", [
        { name: "Prefix", value: config.prefix, inline: true },
        { name: "Staff roles", value: `${config.staffRoleIds.length}`, inline: true },
        { name: "Mod roles", value: `${config.moderatorRoleIds.length}`, inline: true },
    ]);
}
function settingsMainRow() {
    const menu = new SelectMenuBuilder().setCustomId("pulse:settings:menu").setPlaceholder("Choose a category").addOptions(SETTINGS_CATEGORIES);
    return new ActionRowBuilder().addComponents(menu);
}
function settingsBackRow() {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:settings:back").setLabel("Back").setStyle(ButtonStyle.Secondary));
}
function settingsChannelRow(customId, placeholder) {
    const menu = new ChannelSelectMenuComponent({ custom_id: customId, placeholder });
    return new ActionRowBuilder().addComponents(menu);
}
async function renderSettingsCategory(i, category, cfg) {
    if (category === "logging") {
        const embed = embeds.info("Settings · Logging", "Choose where logs are sent.", [
            { name: "Log channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Not configured", inline: true },
            { name: "Mod-log channel", value: cfg.modLogChannelId ? `<#${cfg.modLogChannelId}>` : "Not configured", inline: true },
        ]);
        await i.update({ embeds: [embed], components: [settingsChannelRow("pulse:settings:channel:logChannelId", "Log channel"), settingsChannelRow("pulse:settings:channel:modLogChannelId", "Mod-log channel"), settingsBackRow()] });
        return;
    }
    if (category === "welcome") {
        const embed = embeds.info("Settings · Welcome & Goodbye", "Choose where join/leave messages are sent.", [
            { name: "Welcome channel", value: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "Not configured", inline: true },
            { name: "Goodbye channel", value: cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : "Not configured", inline: true },
        ]);
        await i.update({ embeds: [embed], components: [settingsChannelRow("pulse:settings:channel:welcomeChannelId", "Welcome channel"), settingsChannelRow("pulse:settings:channel:goodbyeChannelId", "Goodbye channel"), settingsBackRow()] });
        return;
    }
    if (category === "moderation") {
        const embed = embeds.info("Settings · Moderation", "Adjust moderation behavior.", [{ name: "Prefix", value: cfg.prefix, inline: true }]);
        const prefixBtn = new ButtonBuilder().setCustomId("pulse:settings:prefix").setLabel("Edit prefix").setStyle(ButtonStyle.Primary);
        await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(prefixBtn), settingsBackRow()] });
        return;
    }
    if (category === "orders") {
        const cats = cfg.orders?.categories;
        await i.update({ embeds: [embeds.info("Settings · Orders", "Manage the design-order system. Use `/order categories` to add or remove design types.", [{ name: "Categories", value: cats?.length ? cats.map((c) => `**${c.label}** (\`${c.value}\`)`).join(", ") : "Default categories in use." }])], components: [settingsBackRow()] });
        return;
    }
    if (category === "automod") {
        const automod = cfg.automod;
        await i.update({ embeds: [embeds.info("Settings · Automod", "Current automod configuration.", [{ name: "Config", value: `\`\`\`json\n${JSON.stringify(automod, null, 2)}\n\`\`\`` }])], components: [settingsBackRow()] });
        return;
    }
    if (category === "general") {
        await i.update({ embeds: [embeds.info("Settings · General", "Overview of server settings.", [
            { name: "Prefix", value: `\`${cfg.prefix}\``, inline: true },
            { name: "Staff roles", value: `${cfg.staffRoleIds.length}`, inline: true },
            { name: "Mod roles", value: `${cfg.moderatorRoleIds.length}`, inline: true },
        ])], components: [settingsBackRow()] });
        return;
    }
    await i.update({ embeds: [settingsMainEmbed(cfg)], components: [settingsMainRow()] });
}

// ── AutoSetup requireSetupAccess helper (from autosetup.js) ──
async function requireSetupAccess(i, client) {
    const cfg = await client.services.settings.get(i.guildId).catch(() => null);
    if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild) && !isStaff(i.member, cfg)) {
        await i.reply({ embeds: [embeds.error("Missing permission", "You need **Manage Server** permission or a staff role to use auto-setup.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        return false;
    }
    return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// Command definition — all subcommands merged into /config
// ══════════════════════════════════════════════════════════════════════════════
const MODULES = [
    { key: "moderation", name: "Moderation", desc: "Warn, ban, kick, timeout, cases" },
    { key: "automod", name: "AutoMod", desc: "Spam, links, invites, caps, words protection" },
    { key: "tickets", name: "Tickets", desc: "Support ticket system" },
    { key: "welcome", name: "Welcome", desc: "Member join/leave messages" },
    { key: "starboard", name: "Starboard", desc: "Starred messages channel" },
    { key: "leveling", name: "Leveling", desc: "XP, levels, rewards" },
    { key: "economy", name: "Economy", desc: "Balance, shop, daily, trading" },
    { key: "reactionroles", name: "Reaction Roles", desc: "Role assignment via reactions" },
    { key: "giveaways", name: "Giveaways", desc: "Giveaway creation and management" },
    { key: "suggestions", name: "Suggestions", desc: "Community suggestion system" },
    { key: "logging", name: "Logging", desc: "Message, moderation, server logs" },
    { key: "orders", name: "Orders", desc: "Design order system" },
];

export default {
    data: new SlashCommandBuilder()
        .setName("config")
        .setDescription("Server configuration center")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        // ── View ──
        .addSubcommand(s => s.setName("view").setDescription("View current configuration"))
        // ── Modules (consolidated) ──
        .addSubcommand(s => s.setName("modules").setDescription("Manage enabled modules")
            .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true).addChoices(
                { name: "List", value: "list" },
                { name: "Enable", value: "enable" },
                { name: "Disable", value: "disable" },
                { name: "Preset", value: "preset" }
            ))
            .addStringOption(o => o.setName("module").setDescription("Module (for enable/disable)").addChoices(...ALL.map(m => ({ name: m, value: m }))))
            .addStringOption(o => o.setName("preset").setDescription("Preset (for preset)").addChoices(
                { name: "Full", value: "full" },
                { name: "Minimal", value: "minimal" },
                { name: "Light", value: "light" }
            )))
        // ── AutoMod ──
        .addSubcommand(s => s.setName("automod").setDescription("Configure AutoMod"))
        // ── Logs (consolidated) ──
        .addSubcommand(s => s.setName("logs").setDescription("Configure log channels")
            .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true).addChoices(
                { name: "Setup", value: "setup" },
                { name: "Settings", value: "settings" },
                { name: "Test", value: "test" },
                { name: "Status", value: "status" },
                { name: "Events", value: "events" },
                { name: "Search", value: "search" }
            ))
            .addChannelOption(o => o.setName("channel").setDescription("Channel (for setup)").addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("type").setDescription("Type (for setup)").addChoices(
                { name: "Log", value: "log" },
                { name: "ModLog", value: "mod" }
            ))
            .addStringOption(o => o.setName("query").setDescription("Search query (for search)")))
        // ── Staff ──
        .addSubcommand(s => s.setName("staff").setDescription("Configure staff roles"))
        // ── Prefix (consolidated) ──
        .addSubcommand(s => s.setName("prefix").setDescription("Configure command prefix")
            .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true).addChoices(
                { name: "View", value: "view" },
                { name: "Set", value: "set" },
                { name: "Reset", value: "reset" }
            ))
            .addStringOption(o => o.setName("prefix").setDescription("New prefix (for set)").setMinLength(1).setMaxLength(10)))
        // ── Settings ──
        .addSubcommand(s => s.setName("settings").setDescription("Configure settings for this server"))
        // ── Welcome (consolidated) ──
        .addSubcommand(s => s.setName("welcome").setDescription("Welcome & goodbye settings")
            .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true).addChoices(
                { name: "Setup", value: "setup" },
                { name: "Test", value: "test" },
                { name: "Preview", value: "preview" },
                { name: "Disable", value: "disable" }
            ))
            .addChannelOption(o => o.setName("channel").setDescription("Channel (for setup)").addChannelTypes(ChannelType.GuildText)))
        // ── Starboard (consolidated) ──
        .addSubcommand(s => s.setName("starboard").setDescription("Starboard settings")
            .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true).addChoices(
                { name: "Set", value: "set" },
                { name: "View", value: "view" },
                { name: "Disable", value: "disable" }
            ))
            .addChannelOption(o => o.setName("channel").setDescription("Channel (for set)").addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(o => o.setName("threshold").setDescription("Stars needed (for set)").setMinValue(1).setMaxValue(20))
            .addStringOption(o => o.setName("emoji").setDescription("Star emoji (for set)")))
        // ── Backup (consolidated) ──
        .addSubcommand(s => s.setName("backup").setDescription("Manage backups")
            .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true).addChoices(
                { name: "Create", value: "create" },
                { name: "List", value: "list" },
                { name: "Restore", value: "restore" }
            ))
            .addStringOption(o => o.setName("id").setDescription("Backup ID (for restore)")))
        // ── Reaction Roles ──
        .addSubcommand(s => s.setName("reactionroles").setDescription("Self-roles panel")
            .addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
            .addStringOption(o => o.setName("roles").setDescription("roleId:emoji:label, comma separated e.g. 123:🎮:Gamer,456:🎨:Artist").setRequired(true)))
        // ── AutoSetup ──
        .addSubcommand(s => s.setName("autosetup").setDescription("Set up roles, log channels, and order channels for this server.")),

    category: "Config",

    // ════════════════════════════════════════════════════════════════════════
    // Execute — routes to the correct subcommand logic
    // ════════════════════════════════════════════════════════════════════════
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const client = interaction.client;
        const prisma = client.prisma;

        const cfg = await client.services.settings.get(interaction.guildId).catch(() => null);
        if (!isStaff(interaction.member, cfg)) {
            return containerReply(interaction, errorPanel("Missing Permission", "You need staff permissions to use this command."), true);
        }

        // ── Original subcommands ──────────────────────────────────────────

        if (sub === "view") {
            const panel = settingsMainPanel(interaction.guild, cfg);
            return containerReply(interaction, panel, true);
        }

        if (sub === "automod") {
            const automod = JSON.parse(cfg.automod || "{}");
            const panel = automodConfigPanel(automod);
            return containerReply(interaction, panel, true);
        }

        if (sub === "staff") {
            const panel = staffRolesPanel(cfg);
            return containerReply(interaction, panel, true);
        }

        // ── Merged: settings.js ───────────────────────────────────────────

        if (sub === "settings") {
            const config = cfg;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.editReply({ embeds: [settingsMainEmbed(config)], components: [settingsMainRow()] });
            return;
        }

        // ── Modules (consolidated) ────────────────────────────────────────

        if (sub === "modules") {
            const action = interaction.options.getString("action", true);
            if (action === "list") {
                const modules = JSON.parse(cfg.modules || "{}");
                const panel = moduleTogglePanel(modules);
                return containerReply(interaction, panel, true);
            }
            if (action === "enable") {
                const mod = interaction.options.getString("module");
                await client.services.settings.setModule(interaction.guildId, mod, true);
                return interaction.reply({ embeds: [embeds.success("Enabled", mod)], flags: MessageFlags.Ephemeral });
            }
            if (action === "disable") {
                const mod = interaction.options.getString("module");
                if (["moderation", "logging"].includes(mod)) return interaction.reply({ embeds: [embeds.warn("Protected", "Cannot disable core")], flags: MessageFlags.Ephemeral });
                await client.services.settings.setModule(interaction.guildId, mod, false);
                return interaction.reply({ embeds: [embeds.success("Disabled", mod)], flags: MessageFlags.Ephemeral });
            }
            if (action === "preset") {
                const preset = interaction.options.getString("preset");
                let next = {};
                if (preset === "full") ALL.forEach(m => next[m] = true);
                else if (preset === "minimal") { ALL.forEach(m => next[m] = false); ["moderation", "automod", "logging", "welcome"].forEach(m => next[m] = true); }
                else if (preset === "light") { ALL.forEach(m => next[m] = true); ["analytics", "achievements", "automation"].forEach(m => next[m] = false); }
                await client.services.settings.patch(interaction.guildId, { modules: next });
                return interaction.reply({ embeds: [embeds.success("Preset applied", preset)], flags: MessageFlags.Ephemeral });
            }
        }

        // ── Logs (consolidated) ───────────────────────────────────────────

        if (sub === "logs") {
            const action = interaction.options.getString("action", true);
            if (action === "setup") {
                const ch = interaction.options.getChannel("channel", true);
                const type = interaction.options.getString("type", true);
                const patch = type === "mod" ? { modLogChannelId: ch.id } : { logChannelId: ch.id };
                await client.services.settings.patch(interaction.guildId, patch);
                return interaction.reply({ embeds: [embeds.success("Set", `${type} → <#${ch.id}>`)], flags: MessageFlags.Ephemeral });
            }
            if (action === "settings" || action === "status") {
                const c = await client.services.settings.get(interaction.guildId);
                return interaction.reply({ embeds: [embeds.info("Logs", `Log: ${c.logChannelId ? "<#" + c.logChannelId + ">" : "—"} \nMod: ${c.modLogChannelId ? "<#" + c.modLogChannelId + ">" : "—"}`)], flags: MessageFlags.Ephemeral });
            }
            if (action === "test") {
                const ch = await client.services.logging.channel(interaction.guild, "mod");
                if (!ch) return interaction.reply({ embeds: [embeds.error("No channel", "Set first")], flags: MessageFlags.Ephemeral });
                await ch.send({ embeds: [embeds.info("Test", "Logging works")] });
                return interaction.reply({ embeds: [embeds.success("Sent", "Test sent")], flags: MessageFlags.Ephemeral });
            }
            if (action === "events") {
                return interaction.reply({ embeds: [embeds.info("Events", "join, leave, moderation, tickets, automod")], flags: MessageFlags.Ephemeral });
            }
            if (action === "search") {
                const q = interaction.options.getString("query") || "";
                const logs = await client.services.audit.timeline(interaction.guildId, { limit: 10 }).catch(() => []);
                const filtered = logs.filter(l => l.action.includes(q) || l.category.includes(q));
                return interaction.reply({ embeds: [embeds.info("Search", filtered.map(l => `${l.category}/${l.action}`).join("\n") || "No matching log entries found.")], flags: MessageFlags.Ephemeral });
            }
        }

        // ── Prefix (consolidated) ─────────────────────────────────────────

        if (sub === "prefix") {
            const action = interaction.options.getString("action", true);
            if (action === "view") {
                const prefixService = client.services.prefix;
                const prefix = await prefixService.getPrefix(interaction.guild.id);
                const defaultPrefix = "!";
                const embed = new EmbedBuilder()
                    .setColor(Theme.panel)
                    .setAuthor({ name: `${interaction.guild.name} • Prefix`, iconURL: interaction.guild.iconURL() ?? undefined })
                    .setTitle("Current Prefix")
                    .setDescription(`**Current:** \`${prefix}\`\n**Default:** \`${defaultPrefix}\`\n\nUse \`${prefix}ping\` or \`${prefix} help\` or slash \`/ping\``)
                    .addFields(
                        { name: "Slash Equivalent", value: "`/config prefix view`", inline: true },
                        { name: "Prefix Equivalent", value: `\`${prefix}prefix\``, inline: true }
                    )
                    .setFooter({ text: `Prefix is per-server.` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            if (action === "set") {
                const prefixService = client.services.prefix;
                const newPrefix = interaction.options.getString("prefix", true);
                try {
                    const clean = await prefixService.setPrefix(interaction.guild.id, newPrefix);
                    const embed = new EmbedBuilder()
                        .setColor(Theme.success)
                        .setTitle("Prefix Updated")
                        .setDescription(`**New prefix:** \`${clean}\`\n\nTry \`${clean}ping\` or \`${clean}help\``)
                        .setFooter({ text: `Per-server • ${interaction.guild.name}` })
                        .setTimestamp();
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    await client.services.audit?.log(interaction.guild.id, { actorId: interaction.user.id, action: "prefix_set", category: "config", details: { prefix: clean } }).catch(() => {});
                    return;
                } catch (e) {
                    return interaction.reply({ embeds: [embeds.error("Invalid prefix", e.message)], flags: MessageFlags.Ephemeral });
                }
            }
            if (action === "reset") {
                const prefixService = client.services.prefix;
                try {
                    const clean = await prefixService.resetPrefix(interaction.guild.id);
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
        }

        // ── Welcome (consolidated) ────────────────────────────────────────

        if (sub === "welcome") {
            const action = interaction.options.getString("action", true);
            if (action === "setup") {
                const ch = interaction.options.getChannel("channel", true);
                await client.services.settings.patch(interaction.guildId, { welcomeChannelId: ch.id });
                return interaction.reply({ embeds: [embeds.success("Set", "Welcome → <#" + ch.id + ">")], flags: MessageFlags.Ephemeral });
            }
            if (action === "test") {
                await client.services.welcome.handleJoin(interaction.member).catch(() => {});
                return interaction.reply({ embeds: [embeds.success("Tested", "Sent")], flags: MessageFlags.Ephemeral });
            }
            if (action === "preview") {
                return interaction.reply({ embeds: [embeds.info("Preview", "Welcome preview — join/leave messages")], flags: MessageFlags.Ephemeral });
            }
            if (action === "disable") {
                await client.services.settings.patch(interaction.guildId, { welcomeChannelId: null });
                return interaction.reply({ embeds: [embeds.success("Disabled", "Welcome messages disabled.")], flags: MessageFlags.Ephemeral });
            }
        }

        // ── Starboard (consolidated) ──────────────────────────────────────

        if (sub === "starboard") {
            const action = interaction.options.getString("action", true);
            if (action === "set") {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
                }
                const ch = interaction.options.getChannel("channel");
                if (!ch) return interaction.reply({ embeds: [embeds.error("Missing option", "Channel is required for setup.")], flags: MessageFlags.Ephemeral });
                const thr = interaction.options.getInteger("threshold") ?? 3;
                const emoji = interaction.options.getString("emoji") ?? "⭐";
                await prisma.starboardConfig.upsert({
                    where: { guildId: interaction.guildId },
                    update: { channelId: ch.id, threshold: thr, emoji },
                    create: { guildId: interaction.guildId, channelId: ch.id, threshold: thr, emoji }
                });
                return containerReply(interaction, successPanel("Starboard Configured", `Channel: <#${ch.id}>\nThreshold: ${thr}\nEmoji: ${emoji}`), true);
            }
            if (action === "view") {
                const sbCfg = await prisma.starboardConfig.findUnique({ where: { guildId: interaction.guildId } });
                if (!sbCfg) return containerReply(interaction, infoPanel("Starboard", "Not configured"), true);
                return containerReply(interaction, infoPanel("Starboard Configuration", `Channel: <#${sbCfg.channelId}>\nThreshold: ${sbCfg.threshold}\nEmoji: ${sbCfg.emoji}`), true);
            }
            if (action === "disable") {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
                }
                await prisma.starboardConfig.delete({ where: { guildId: interaction.guildId } }).catch(() => {});
                return containerReply(interaction, successPanel("Starboard Disabled", "Starboard has been disabled for this server."), true);
            }
        }

        // ── Backup (consolidated) ─────────────────────────────────────────

        if (sub === "backup") {
            const action = interaction.options.getString("action", true);
            if (action === "create") {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
                const svc = client.services.backup;
                const b = await svc.create(interaction.guildId, interaction.user).catch(() => null);
                if (!b) return interaction.editReply({ embeds: [embeds.error("Failed", "Could not create backup")] });
                return interaction.editReply({ embeds: [embeds.success("Backup created", `ID \`${b.id}\` at <t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`)] });
            }
            if (action === "list") {
                const svc = client.services.backup;
                const list = await svc.list(interaction.guildId, 10);
                const embed = new EmbedBuilder().setColor(0x9b8ecf).setTitle("Backups").setDescription(list.length ? list.map(b => `\`${b.id}\` <t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R> by <@${b.createdById}>`).join("\n") : "No backups found. Create one with /config backup create.");
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            if (action === "restore") {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ embeds: [embeds.error("No perm", "Administrator or Manage Server required")], flags: MessageFlags.Ephemeral });
                }
                const id = interaction.options.getString("id");
                if (!id) return interaction.reply({ embeds: [embeds.error("Missing option", "Backup ID is required.")], flags: MessageFlags.Ephemeral });
                const svc = client.services.backup;
                const backup = await svc.get(interaction.guildId, id);
                if (!backup) return interaction.reply({ embeds: [embeds.error("Not found", id)], flags: MessageFlags.Ephemeral });
                const row = confirmationRow({ acceptCustomId: `backup:restore:${id}:yes`, cancelCustomId: `backup:restore:${id}:no`, danger: true, acceptLabel: "Restore", cancelLabel: "Cancel" });
                const embed = embeds.warn("Confirm restore", `Restore backup \`${id}\` from <t:${Math.floor(new Date(backup.createdAt).getTime() / 1000)}:R>? This will overwrite config.`);
                const msg = await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
                const reply = await interaction.fetchReply().catch(() => null);
                if (!reply) return;
                const collector = reply.createMessageComponentCollector({ filter: (i) => i.user.id === interaction.user.id, time: 30000, max: 1 });
                collector.on("collect", async i => {
                    if (i.customId.endsWith(":no")) return i.update({ embeds: [embeds.info("Cancelled", "Not restored")], components: [] }).catch(() => {});
                    await i.deferUpdate().catch(() => {});
                    try { await svc.restore(interaction.guildId, id, interaction.user, { confirm: true }); await i.editReply({ embeds: [embeds.success("Restored", `Backup \`${id}\` restored`)], components: [] }).catch(() => {}); }
                    catch (e) { await i.editReply({ embeds: [embeds.error("Failed", String(e.message).slice(0, 500))], components: [] }).catch(() => {}); }
                });
                collector.on("end", c => { if (c.size === 0) interaction.editReply({ components: [] }).catch(() => {}); });
            }
        }

        // ── Merged: reactionroles.js ──────────────────────────────────────

        if (sub === "reactionroles") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ embeds: [embeds.error("No perm", "ManageGuild needed")], flags: MessageFlags.Ephemeral });
            }
            const ch = interaction.options.getChannel("channel");
            const title = interaction.options.getString("title");
            const raw = interaction.options.getString("roles");
            const mappings = raw.split(",").map(s => { const [roleId, emoji, label] = s.split(":"); return { roleId: roleId.trim(), emoji: emoji?.trim() ?? "•", label: (label ?? "Role").trim() }; });
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const msg = await client.services.reactionRoles.createPanel(interaction.guild, ch, title, mappings);
            await interaction.editReply({ content: `Created in <#${ch.id}> — ${msg.url}` });
            return;
        }

        // ── Merged: autosetup.js ──────────────────────────────────────────

        if (sub === "autosetup") {
            const member = interaction.member;
            const guild = interaction.guild;
            if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ embeds: [embeds.error("Missing permission", "You need **Manage Server** permission to run auto-setup.")], flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const detectedStaff = detectStaffRole(guild);
            const detectedMod = detectModeratorRole(guild);
            const initial = { staff: detectedStaff ? [detectedStaff.id] : [], mod: detectedMod ? [detectedMod.id] : [], createMissing: false };
            selections.set(selKey(guild.id, interaction.user.id), initial);

            const handlerStaff = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isStringSelectMenu()) return;
                const sel = selections.get(selKey(i.guild.id, i.user.id)) ?? { staff: [], mod: [], createMissing: false };
                sel.staff = i.values.filter((v) => v !== "none");
                selections.set(selKey(i.guild.id, i.user.id), sel);
                await i.update(renderSetup(i.guild, i.user.id)).catch(() => {});
            };
            const handlerMod = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isStringSelectMenu()) return;
                const sel = selections.get(selKey(i.guild.id, i.user.id)) ?? { staff: [], mod: [], createMissing: false };
                sel.mod = i.values.filter((v) => v !== "none");
                selections.set(selKey(i.guild.id, i.user.id), sel);
                await i.update(renderSetup(i.guild, i.user.id)).catch(() => {});
            };
            const handlerToggle = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isButton()) return;
                const sel = selections.get(selKey(i.guild.id, i.user.id)) ?? { staff: [], mod: [], createMissing: false };
                sel.createMissing = !sel.createMissing;
                selections.set(selKey(i.guild.id, i.user.id), sel);
                await i.update(renderSetup(i.guild, i.user.id)).catch(() => {});
            };
            const handlerPreview = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isButton()) return;
                await i.deferUpdate().catch(() => {});
                const sel = selections.get(selKey(i.guild.id, i.user.id)) ?? { staff: [], mod: [], createMissing: false };
                const config = await client.services.settings.get(i.guild.id).catch(() => null);
                const plan = await buildSetupPlan(i.guild, sel, config, {});
                await i.editReply(renderPreview(i.guild, plan)).catch(() => {});
            };
            const handlerRepair = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isButton()) return;
                await i.deferUpdate().catch(() => {});
                const sel = selections.get(selKey(i.guild.id, i.user.id)) ?? { staff: [], mod: [], createMissing: false };
                const config = await client.services.settings.get(i.guild.id).catch(() => null);
                if (!sel.staff.length && config?.staffRoleIds?.length) sel.staff = config.staffRoleIds.slice(0, 1);
                if (!sel.mod.length && config?.moderatorRoleIds?.length) sel.mod = config.moderatorRoleIds.slice(0, 1);
                const plan = await buildSetupPlan(i.guild, sel, config, { repairMode: true });
                if (plan.permissions.warnings.length) {
                    await i.editReply({ embeds: [embeds.warn("Repair blocked", plan.permissions.warnings.join("\n"))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(() => {});
                    return;
                }
                if (plan.hierarchy && !plan.hierarchy.ok) {
                    await i.editReply({ embeds: [embeds.warn("Hierarchy blocked", plan.hierarchy.problems.map((p) => p.reason).join("\n"))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(() => {});
                    return;
                }
                const results = await executePlan(i.guild, plan, client);
                const embed = embeds.success("Repair complete.", "Only broken resources were repaired.", [
                    { name: "ROLES", value: [results.roles.staff ? `Staff: ${results.roles.staff.id ? `<@&${results.roles.staff.id}>` : `\`${results.roles.staff.name ?? "—"}\``} (${results.roles.staff.action})` : "—", results.roles.mod ? `Moderator: ${results.roles.mod.id ? `<@&${results.roles.mod.id}>` : `\`${results.roles.mod.name ?? "—"}\``} (${results.roles.mod.action})` : "—"].join("\n") },
                    { name: "CATEGORIES", value: [results.categories.logs ? `${results.categories.logs.name} (${results.categories.logs.action})` : "—", results.categories.orders ? `${results.categories.orders.name} (${results.categories.orders.action})` : "—"].join("\n") },
                    { name: "CHANNELS", value: [results.channels.log ? `<#${results.channels.log.id}> (${results.channels.log.action})` : "—", results.channels.modLog ? `<#${results.channels.modLog.id}> (${results.channels.modLog.action})` : "—", results.channels.welcome ? `<#${results.channels.welcome.id}> (${results.channels.welcome.action})` : "—"].join("\n") },
                    { name: "CONFIGURATION", value: results.config?.action === "saved" ? "Guild configuration saved" : `${results.config?.reason || "failed"}` },
                ]);
                await i.editReply({ embeds: [embed], components: [] }).catch(() => {});
                selections.delete(selKey(i.guild.id, i.user.id));
            };
            const handlerBack = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isButton()) return;
                await i.update(renderSetup(i.guild, i.user.id)).catch(() => {});
            };
            const handlerConfirm = async (i) => {
                if (!await requireSetupAccess(i, client)) return;
                if (!i.isButton()) return;
                await i.deferUpdate().catch(() => {});
                const sel = selections.get(selKey(i.guild.id, i.user.id)) ?? { staff: [], mod: [], createMissing: false };
                const config = await client.services.settings.get(i.guild.id).catch(() => null);
                const plan = await buildSetupPlan(i.guild, sel, config, {});
                if (!sel.staff.length && plan.roles.staff.action === "skip" && !plan.roles.staff.roleId) {
                    if (plan.roles.staff.action === "skip") {
                        await i.editReply({ embeds: [embeds.warn("Roles required", "Please select a Staff role or enable **Create missing roles**.")], components: [] }).catch(() => {});
                        selections.delete(selKey(i.guild.id, i.user.id));
                        return;
                    }
                }
                if (!sel.mod.length && plan.roles.mod.action === "skip") {
                    if (plan.roles.mod.action === "skip") {
                        await i.editReply({ embeds: [embeds.warn("Roles required", "Please select a Moderator role or enable **Create missing roles**.")], components: [] }).catch(() => {});
                        selections.delete(selKey(i.guild.id, i.user.id));
                        return;
                    }
                }
                if (plan.permissions.warnings.length) {
                    await i.editReply({ embeds: [embeds.warn("Missing bot permissions", plan.permissions.warnings.join("\n") + "\n\nGive the bot **Manage Channels** and **Manage Roles** then try again.")], components: [] }).catch(() => {});
                    selections.delete(selKey(i.guild.id, i.user.id));
                    return;
                }
                if (plan.hierarchy && !plan.hierarchy.ok) {
                    await i.editReply({ embeds: [embeds.warn("Hierarchy blocked", plan.hierarchy.problems.map((p) => p.reason).join("\n") + "\n\nMove the bot role above the target roles.")], components: [] }).catch(() => {});
                    selections.delete(selKey(i.guild.id, i.user.id));
                    return;
                }
                try {
                    const results = await executePlan(i.guild, plan, client);
                    const embed = embeds.success("Setup complete.", "Per-server configuration saved.", [
                        { name: "ROLES", value: [results.roles.staff ? `Staff: ${results.roles.staff.id ? `<@&${results.roles.staff.id}>` : `\`${results.roles.staff.name ?? "—"}\``} (${results.roles.staff.action})` : "—", results.roles.mod ? `Moderator: ${results.roles.mod.id ? `<@&${results.roles.mod.id}>` : `\`${results.roles.mod.name ?? "—"}\``} (${results.roles.mod.action})` : "—"].join("\n") },
                        { name: "CATEGORIES", value: [results.categories.logs ? `${results.categories.logs.name} (${results.categories.logs.action})` : "—", results.categories.orders ? `${results.categories.orders.name} (${results.categories.orders.action})` : "—"].join("\n") },
                        { name: "CHANNELS", value: [results.channels.log ? `<#${results.channels.log.id}> (${results.channels.log.action})` : "—", results.channels.modLog ? `<#${results.channels.modLog.id}> (${results.channels.modLog.action})` : "—", results.channels.welcome ? `<#${results.channels.welcome.id}> (${results.channels.welcome.action})` : "—"].join("\n") },
                        { name: "CONFIGURATION", value: results.config?.action === "saved" ? "Guild configuration saved" : `${results.config?.reason || "failed"}` },
                    ]);
                    await i.editReply({ embeds: [embed], components: [] }).catch(() => {});
                } catch (e) {
                    logger.error("autosetup", "run failed", e);
                    await i.editReply({ embeds: [embeds.error("Setup failed", "Could not finish setup. Ensure the bot has **Manage Channels** and **Manage Roles**.")], components: [] }).catch(() => {});
                }
                selections.delete(selKey(i.guild.id, i.user.id));
            };

            client.components.set("pulse:setup:staff", handlerStaff);
            client.components.set("pulse:setup:mod", handlerMod);
            client.components.set("pulse:setup:toggleCreate", handlerToggle);
            client.components.set("pulse:setup:preview", handlerPreview);
            client.components.set("pulse:setup:repair", handlerRepair);
            client.components.set("pulse:setup:back", handlerBack);
            client.components.set("pulse:setup:confirm", handlerConfirm);

            await interaction.editReply(renderSetup(guild, interaction.user.id));
            return;
        }
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// Component handlers — registered at module scope
// ══════════════════════════════════════════════════════════════════════════════
export const componentHandlers = {
    // ── Original config.js handlers ──
    "settings:module:toggle:": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const key = i.customId.replace("settings:module:toggle:", "");
        const cfg = await i.client.services.settings.get(i.guildId);
        const modules = JSON.parse(cfg.modules || "{}");
        modules[key] = !modules[key];
        await i.client.services.settings.patch(i.guildId, { modules });
        const panel = moduleTogglePanel(modules);
        await i.update({ components: [panel] });
    },

    "settings:module:config:": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const key = i.customId.replace("settings:module:config:", "");
        if (key === "automod") {
            const cfg = await i.client.services.settings.get(i.guildId);
            const automod = JSON.parse(cfg.automod || "{}");
            const panel = automodConfigPanel(automod);
            await i.update({ components: [panel] });
        }
    },

    "settings:logs:modlog": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const menu = new ChannelSelectMenuComponent()
            .setCustomId("settings:logs:modlog:select")
            .setPlaceholder("Select mod log channel")
            .addChannelTypes(ChannelType.GuildText);
        const container = createContainer([headerText("Set Moderation Log Channel"), divider(), bodyText("Select the channel for moderation logs:"), divider(), createActionRow(menu)]);
        await i.update({ components: [container] });
    },

    "settings:logs:modlog:select": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const channelId = i.values[0];
        await i.client.services.settings.patch(i.guildId, { modLogChannelId: channelId });
        const cfg = await i.client.services.settings.get(i.guildId);
        const panel = logChannelsPanel(cfg);
        await i.update({ components: [panel] });
    },

    "settings:logs:generallog": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const menu = new ChannelSelectMenuComponent()
            .setCustomId("settings:logs:generallog:select")
            .setPlaceholder("Select general log channel")
            .addChannelTypes(ChannelType.GuildText);
        const container = createContainer([headerText("Set General Log Channel"), divider(), bodyText("Select the channel for general logs:"), divider(), createActionRow(menu)]);
        await i.update({ components: [container] });
    },

    "settings:logs:generallog:select": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        await i.client.services.settings.patch(i.guildId, { logChannelId: i.values[0] });
        const cfg = await i.client.services.settings.get(i.guildId);
        const panel = logChannelsPanel(cfg);
        await i.update({ components: [panel] });
    },

    "settings:prefix:set": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const modal = new ModalBuilder()
            .setCustomId("settings:prefix:modal")
            .setTitle("Set Command Prefix");
        const input = new TextInputBuilder()
            .setCustomId("prefix")
            .setLabel("New prefix (1-5 characters)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(5)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    },

    "settings:prefix:modal": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const prefix = i.fields.getTextInputValue("prefix");
        await i.client.services.settings.patch(i.guildId, { prefix });
        const cfg = await i.client.services.settings.get(i.guildId);
        const panel = prefixPanel(cfg.prefix);
        await i.update({ components: [panel] });
    },

    "settings:prefix:reset": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        await i.client.services.settings.patch(i.guildId, { prefix: "!" });
        const panel = prefixPanel("!");
        await i.update({ components: [panel] });
    },

    "settings:staff:add": async (i) => {
        if (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null))) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const menu = new RoleSelectMenuComponent()
            .setCustomId("settings:staff:add:select")
            .setPlaceholder("Select staff role(s)")
            .setMinValues(1)
            .setMaxValues(10);
        const container = createContainer([headerText("Add Staff Role"), divider(), bodyText("Select role(s) to add as staff:"), divider(), createActionRow(menu)]);
        await i.update({ components: [container] });
    },

    "settings:staff:add:select": async (i) => {
        const cfg = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild) && !isStaff(i.member, cfg)) {
            return i.reply({ components: [errorPanel("Missing Permission", "Staff only")], flags: MessageFlags.Ephemeral });
        }
        const myHighest = i.guild.members.me?.roles.highest?.position ?? 0;
        for (const roleId of i.values) {
            const role = i.guild.roles.cache.get(roleId) ?? await i.guild.roles.fetch(roleId).catch(() => null);
            if (!role || role.managed || role.id === i.guild.roles.everyone.id) {
                return i.reply({ components: [errorPanel("Invalid role", "Selected roles must exist, not be managed integrations, and not be @everyone.")], flags: MessageFlags.Ephemeral });
            }
            if (role.position >= myHighest) {
                return i.reply({ components: [errorPanel("Role too high", `Cannot add **${role.name}** — it is equal to or higher than the bot's highest role.`)], flags: MessageFlags.Ephemeral });
            }
            const perms = role.permissions;
            if (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.BanMembers) || perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.ManageRoles)) {
                return i.reply({ components: [errorPanel("Dangerous role", `**${role.name}** has elevated permissions (${perms.has(PermissionFlagsBits.Administrator) ? "Administrator" : "ManageGuild/ManageRoles/BanMembers"}). Add it manually via Discord to avoid privilege escalation.`)], flags: MessageFlags.Ephemeral });
            }
        }
        const current = cfg?.staffRoleIds ? cfg.staffRoleIds.split(",") : [];
        const newRoles = [...new Set([...current, ...i.values])];
        await i.client.services.settings.patch(i.guildId, { staffRoleIds: newRoles.join(",") });
        const panel = staffRolesPanel(await i.client.services.settings.get(i.guildId));
        await i.update({ components: [panel] });
    },

    // ── Merged from settings.js (pulse:settings:*) ──
    "pulse:settings:menu": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const category = i.values[0];
        const cfg = await i.client.services.settings.get(i.guildId);
        await renderSettingsCategory(i, category, cfg);
    },

    "pulse:settings:back": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const cfg = await i.client.services.settings.get(i.guildId);
        await i.update({ embeds: [settingsMainEmbed(cfg)], components: [settingsMainRow()] });
    },

    "pulse:settings:channel:logChannelId": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const id = i.values[0];
        const channel = i.guild.channels.cache.get(id) ?? await i.guild.channels.fetch(id).catch(() => null);
        if (!channel) {
            await i.reply({ embeds: [embeds.error("Not found", "That channel no longer exists in this server.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        await i.client.services.settings.patch(i.guildId, { logChannelId: id });
        const cfg = await i.client.services.settings.get(i.guildId);
        await renderSettingsCategory(i, "logging", cfg);
    },

    "pulse:settings:channel:modLogChannelId": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const id = i.values[0];
        const channel = i.guild.channels.cache.get(id) ?? await i.guild.channels.fetch(id).catch(() => null);
        if (!channel) {
            await i.reply({ embeds: [embeds.error("Not found", "That channel no longer exists in this server.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        await i.client.services.settings.patch(i.guildId, { modLogChannelId: id });
        const cfg = await i.client.services.settings.get(i.guildId);
        await renderSettingsCategory(i, "logging", cfg);
    },

    "pulse:settings:channel:welcomeChannelId": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const id = i.values[0];
        const channel = i.guild.channels.cache.get(id) ?? await i.guild.channels.fetch(id).catch(() => null);
        if (!channel) {
            await i.reply({ embeds: [embeds.error("Not found", "That channel no longer exists in this server.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        await i.client.services.settings.patch(i.guildId, { welcomeChannelId: id });
        const cfg = await i.client.services.settings.get(i.guildId);
        await renderSettingsCategory(i, "welcome", cfg);
    },

    "pulse:settings:channel:goodbyeChannelId": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const id = i.values[0];
        const channel = i.guild.channels.cache.get(id) ?? await i.guild.channels.fetch(id).catch(() => null);
        if (!channel) {
            await i.reply({ embeds: [embeds.error("Not found", "That channel no longer exists in this server.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        await i.client.services.settings.patch(i.guildId, { goodbyeChannelId: id });
        const cfg = await i.client.services.settings.get(i.guildId);
        await renderSettingsCategory(i, "welcome", cfg);
    },

    "pulse:settings:prefix": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const cfg = await i.client.services.settings.get(i.guildId);
        const modal = new ModalBuilder().setCustomId("pulse:settings:prefix:modal").setTitle("Set command prefix");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("prefix").setLabel("Prefix").setStyle(TextInputStyle.Short).setMaxLength(3).setValue(cfg.prefix)));
        await i.showModal(modal);
    },

    "pulse:settings:prefix:modal": async (i) => {
        const c = await i.client.services.settings.get(i.guildId).catch(() => null);
        if (!isStaff(i.member, c)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can change settings.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        const prefix = i.fields.getTextInputValue("prefix");
        await i.client.services.settings.patch(i.guildId, { prefix });
        await i.reply({ embeds: [embeds.success("Prefix updated", `Commands prefix set to \`${prefix}\`.`)], flags: MessageFlags.Ephemeral });
    },
};

// ── Prefix traditional command handler (from prefix.js) ──
export const prefixExecute = async (message, args, subcommand, prefix) => {
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
};
