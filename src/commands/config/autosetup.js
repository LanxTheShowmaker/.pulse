import {
    SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits, MessageFlags,
} from "discord.js";
import { embeds } from "../../design/embeds.js";
import { logger } from "../../core/logger.js";

const selections = new Map(); // guildId -> { staff:string[], mod:string[], createMissing:boolean }

// Keywords per spec — conservative, case-insensitive
const STAFF_KEYWORDS = ["staff", "staffs", "administrator", "admin", "management", "manager"];
const MOD_KEYWORDS = ["moderator", "moderators", "mod", "moderation", "support"];

// Channel candidates — Server-x naming first, legacy names last
const LOGS_CHANNEL_CANDIDATES = [
    "server-log", "server-logs", "pulse-log", "pulse-logs",
    "bot-logs", "logs", "server-logs"
];
const MODLOG_CHANNEL_CANDIDATES = [
    "server-modlog", "server-mod-log", "server-modlogs",
    "pulse-modlog",
    "mod-log", "modlog", "modlogs", "moderation-logs", "moderator-logs"
];
const WELCOME_CHANNEL_CANDIDATES = [
    "server-welcome", "pulse-welcome",
    "welcome", "welcomes", "server-welcome"
];
const ORDERS_CATEGORY_CANDIDATES = [
    "design-orders", "orders", "commissions", "commission-orders"
];
const LOGS_CATEGORY_CANDIDATES = [
    "server logs", "pulse logs", "logs"
];

// New frontend names when creating (Server-x per user)
const NEW_STAFF_ROLE = "Server staff";
const NEW_MOD_ROLE = "Server Moderator";
const NEW_LOGS_CATEGORY = "Server Logs";
const NEW_ORDERS_CATEGORY = "design-orders";
const NEW_LOG_CHANNEL = "server-log";
const NEW_MODLOG_CHANNEL = "server-modlog";
const NEW_WELCOME_CHANNEL = "server-welcome";

function normalizeRoleName(name) {
    return name.toLowerCase().trim().replace(/\s+/g, " ");
}
function normalizeChannelName(name) {
    return name.toLowerCase().trim().replace(/[_]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function roleOptions(guild) {
    return guild.roles.cache
        .filter((r) => !r.managed && r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first(24)
        .map((r) => ({ label: r.name.slice(0, 80), value: r.id }));
}

// Conservative scoring — false positives worse than manual selection
function scoreRoleAgainstKeywords(roleName, keywords) {
    const norm = normalizeRoleName(roleName);
    const tokens = norm.split(" ");
    let best = 0;
    for (const kw of keywords) {
        const k = kw.toLowerCase();
        if (norm === k) best = Math.max(best, 100);
        else if (tokens.length <= 2 && tokens.includes(k)) best = Math.max(best, 60);
        // No fuzzy substring for 3+ token roles like "VIP Moderator Fan Role" → 0
    }
    return best;
}

function findMatchingRole(guild, keywords) {
    let bestRole = null;
    let bestScore = 0;
    for (const role of guild.roles.cache.values()) {
        if (role.managed || role.id === guild.id) continue;
        const score = scoreRoleAgainstKeywords(role.name, keywords);
        if (score > bestScore) {
            bestScore = score;
            bestRole = role;
        } else if (score === bestScore && bestRole && score > 0) {
            // tie-break higher position (stronger role)
            if (role.position > bestRole.position) bestRole = role;
        }
    }
    return bestScore > 0 ? bestRole : null;
}

function detectStaffRole(guild) {
    return findMatchingRole(guild, STAFF_KEYWORDS);
}
function detectModeratorRole(guild) {
    return findMatchingRole(guild, MOD_KEYWORDS);
}

function findMatchingChannel(guild, candidates, type = ChannelType.GuildText) {
    const normalizedCandidates = candidates.map((c) => normalizeChannelName(c));
    // Prefer candidates in priority order
    for (let idx = 0; idx < normalizedCandidates.length; idx++) {
        const cand = normalizedCandidates[idx];
        for (const ch of guild.channels.cache.values()) {
            if (ch.type !== type) continue;
            if (normalizeChannelName(ch.name) === cand) return ch;
        }
    }
    return null;
}

function findMatchingCategory(guild, candidates) {
    const norms = candidates.map((c) => c.toLowerCase().trim());
    for (let idx = 0; idx < norms.length; idx++) {
        const cand = norms[idx];
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
        if (role.position >= highest.position) {
            problems.push({ id, name: role.name, reason: `Role @${role.name} is above or equal to bot's highest role (@${highest.name})` });
        }
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

// Build a plan without side effects — shared by preview and actual run
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

    // Auto-detect if no selection
    const detectedStaff = detectStaffRole(guild);
    const detectedMod = detectModeratorRole(guild);

    // Staff role plan
    const staffId = sel.staff[0];
    if (staffId) {
        const role = guild.roles.cache.get(staffId);
        plan.roles.staff = { action: role ? "reuse" : "repair", roleId: staffId, name: role?.name ?? staffId, source: "selected" };
        if (!role) {
            // config pointed to deleted role — recover
            const repl = detectedStaff;
            if (repl) {
                plan.roles.staff = { action: "repair", roleId: repl.id, name: repl.name, source: "detected-recovery" };
                plan.configRecovery.push(`Staff ${staffId} → ${repl.id}`);
            } else if (sel.createMissing && plan.permissions.canManageRoles) {
                plan.roles.staff = { action: "create", name: NEW_STAFF_ROLE, source: "createMissing" };
            } else {
                plan.roles.staff = { action: "blocked", reason: "Selected role missing and create disabled" };
            }
        }
    } else if (detectedStaff) {
        plan.roles.staff = { action: "reuse", roleId: detectedStaff.id, name: detectedStaff.name, source: "detected" };
    } else if (sel.createMissing && plan.permissions.canManageRoles) {
        plan.roles.staff = { action: "create", name: NEW_STAFF_ROLE, source: "createMissing" };
    } else {
        plan.roles.staff = { action: "skip", reason: "No Staff role selected or detected" };
    }

    // Mod role plan
    const modId = sel.mod[0];
    if (modId) {
        const role = guild.roles.cache.get(modId);
        plan.roles.mod = { action: role ? "reuse" : "repair", roleId: modId, name: role?.name ?? modId, source: "selected" };
        if (!role) {
            const repl = detectedMod;
            if (repl) {
                plan.roles.mod = { action: "repair", roleId: repl.id, name: repl.name, source: "detected-recovery" };
                plan.configRecovery.push(`Mod ${modId} → ${repl.id}`);
            } else if (sel.createMissing && plan.permissions.canManageRoles) {
                plan.roles.mod = { action: "create", name: NEW_MOD_ROLE, source: "createMissing" };
            } else {
                plan.roles.mod = { action: "blocked", reason: "Selected role missing" };
            }
        }
    } else if (detectedMod) {
        plan.roles.mod = { action: "reuse", roleId: detectedMod.id, name: detectedMod.name, source: "detected" };
    } else if (sel.createMissing && plan.permissions.canManageRoles) {
        plan.roles.mod = { action: "create", name: NEW_MOD_ROLE, source: "createMissing" };
    } else {
        plan.roles.mod = { action: "skip", reason: "No Moderator role selected" };
    }

    // Hierarchy validation (only for reuse/repair with actual roleId)
    const toCheck = [plan.roles.staff?.roleId, plan.roles.mod?.roleId].filter(Boolean);
    if (toCheck.length) {
        plan.hierarchy = validateRoleHierarchy(guild, toCheck);
    }

    // Channel/Category detection — prefer config IDs if valid, otherwise findMatching
    // Logs category
    let logsCat = null;
    // First try matching any known name
    logsCat = findMatchingCategory(guild, LOGS_CATEGORY_CANDIDATES);
    if (logsCat) {
        plan.categories.logs = { action: "reuse", id: logsCat.id, name: logsCat.name };
    } else {
        plan.categories.logs = { action: plan.permissions.canManageChannels ? "create" : "blocked", name: NEW_LOGS_CATEGORY };
    }

    // Orders category
    let ordersCat = findMatchingCategory(guild, ORDERS_CATEGORY_CANDIDATES);
    if (ordersCat) {
        plan.categories.orders = { action: "reuse", id: ordersCat.id, name: ordersCat.name };
    } else {
        plan.categories.orders = { action: plan.permissions.canManageChannels ? "create" : "blocked", name: NEW_ORDERS_CATEGORY };
    }

    // Channels — also consider config recovery
    function resolveChannel(planKey, candidates, configKey, newName, parentPlan) {
        // 1. config ID if exists and still valid
        const cfgId = config?.[configKey];
        if (cfgId) {
            const ch = guild.channels.cache.get(cfgId) ?? null;
            if (ch && ch.type === ChannelType.GuildText) {
                // Check if in correct parent (for logs)
                if (parentPlan && parentPlan.id && ch.parentId !== parentPlan.id && ch.parentId !== null) {
                    // Wrong category — repair mode will move? For now mark repair if repairMode
                    if (repairMode) plan.channels[planKey] = { action: "repair", id: ch.id, name: ch.name, reason: "Wrong category" };
                    else plan.channels[planKey] = { action: "reuse", id: ch.id, name: ch.name };
                    return;
                }
                plan.channels[planKey] = { action: "reuse", id: ch.id, name: ch.name };
                return;
            } else if (ch === null) {
                // deleted — fall through to findMatching
                plan.configRecovery.push(`${configKey} ${cfgId} deleted`);
            }
        }
        // 2. find matching by name
        const found = findMatchingChannel(guild, candidates, ChannelType.GuildText);
        if (found) {
            // If config was stale, this is a repair
            const action = cfgId ? "repair" : "reuse";
            plan.channels[planKey] = { action, id: found.id, name: found.name };
            return;
        }
        // 3. create
        plan.channels[planKey] = { action: plan.permissions.canManageChannels ? "create" : "blocked", name: newName };
    }

    resolveChannel("log", LOGS_CHANNEL_CANDIDATES, "logChannelId", NEW_LOG_CHANNEL, plan.categories.logs.action==="reuse"? {id: plan.categories.logs.id}: null);
    resolveChannel("modLog", MODLOG_CHANNEL_CANDIDATES, "modLogChannelId", NEW_MODLOG_CHANNEL, plan.categories.logs.action==="reuse"? {id: plan.categories.logs.id}: null);
    resolveChannel("welcome", WELCOME_CHANNEL_CANDIDATES, "welcomeChannelId", NEW_WELCOME_CHANNEL, null);

    // Repair mode extra checks: perms incorrect, channel in wrong cat, etc.
    if (repairMode && config) {
        // Check logs category perms
        if (logsCat) {
            const overw = logsCat.permissionOverwrites.cache;
            const everyone = overw.get(guild.roles.everyone.id);
            const needsRepair = !everyone || everyone.allow.has(PermissionFlagsBits.ViewChannel);
            // Also check staff/mod can view — simplified: if missing, repair
            if (needsRepair && plan.permissions.canManageChannels) {
                // mark for repair (will be handled in execute by hideFromMembers)
                plan.categories.logs.repairPerms = true;
            }
        }
    }

    return plan;
}

function formatRole(r) {
    if (!r) return "—";
    if (r.action === "reuse") return `<@&${r.roleId}> (reused)`;
    if (r.action === "repair") return `<@&${r.roleId}> (repaired)`;
    if (r.action === "create") return `\`${r.name}\` (will create)`;
    if (r.action === "blocked") return `${r.reason}`;
    if (r.action === "skip") return `${r.reason}`;
    return `—`;
}
function formatChannel(c) {
    if (!c) return "—";
    if (c.action === "reuse") return `<#${c.id}> (reused)`;
    if (c.action === "repair") return `<#${c.id}> (repaired)`;
    if (c.action === "create") return `\`#${c.name}\` (will create)`;
    if (c.action === "blocked") return `blocked (no perm)`;
    return "—";
}
function formatCategory(c) {
    if (!c) return "—";
    if (c.action === "reuse") return `${c.name} (reused)`;
    if (c.action === "create") return `${c.name} (will create)`;
    if (c.action === "blocked") return `blocked`;
    return "—";
}

function renderSetup(guild) {
    const sel = selections.get(guild.id) ?? { staff: [], mod: [], createMissing: false };
    const staffOpts = roleOptions(guild);
    const modOpts = roleOptions(guild);
    if (!staffOpts.length) staffOpts.push({ label: "No roles found", value: "none", description: "Create a role first" });
    if (!modOpts.length) modOpts.push({ label: "No roles found", value: "none", description: "Create a role first" });

    const staffMenu = new StringSelectMenuBuilder()
        .setCustomId("pulse:setup:staff")
        .setPlaceholder("Select Staff role")
        .addOptions(staffOpts);
    const modMenu = new StringSelectMenuBuilder()
        .setCustomId("pulse:setup:mod")
        .setPlaceholder("Select Moderator role")
        .addOptions(modOpts);

    const toggle = new ButtonBuilder()
        .setCustomId("pulse:setup:toggleCreate")
        .setLabel(`Create missing: ${sel.createMissing ? "On" : "Off"}`)
        .setStyle(sel.createMissing ? ButtonStyle.Success : ButtonStyle.Secondary);

    const previewBtn = new ButtonBuilder().setCustomId("pulse:setup:preview").setLabel("Preview").setStyle(ButtonStyle.Secondary);
    const repairBtn = new ButtonBuilder().setCustomId("pulse:setup:repair").setLabel("Repair").setStyle(ButtonStyle.Secondary);
    const confirm = new ButtonBuilder().setCustomId("pulse:setup:confirm").setLabel("Run Setup").setStyle(ButtonStyle.Success);

    // Detection summary (sync quick check)
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
        { name: "Channels", value: [
            logsCh ? `> Logs — <#${logsCh.id}>` : `> Logs — \`#${NEW_LOG_CHANNEL}\` (will create)`,
            modlogCh ? `> Mod-log — <#${modlogCh.id}>` : `> Mod-log — \`#${NEW_MODLOG_CHANNEL}\` (will create)`,
            welcomeCh ? `> Welcome — <#${welcomeCh.id}>` : `> Welcome — \`#${NEW_WELCOME_CHANNEL}\` (will create)`,
        ].join("\n"), inline: false },
        { name: "Categories", value: [
            logsCat ? `> ${logsCat.name}` : `> ${NEW_LOGS_CATEGORY} (will create)`,
            ordersCat ? `> ${ordersCat.name}` : `> ${NEW_ORDERS_CATEGORY} (will create)`,
        ].join("\n"), inline: true },
        { name: "Permissions", value: permWarnings, inline: false },
    ], {
        author: { name: `${guild.name}`, iconURL: guild.iconURL({ size: 64 }) ?? undefined },
        footer: `${guild.memberCount} members`,
    });
    embed.setThumbnail(guild.iconURL({ size: 128 }) ?? null);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(staffMenu),
            new ActionRowBuilder().addComponents(modMenu),
            new ActionRowBuilder().addComponents(toggle, previewBtn, repairBtn),
            new ActionRowBuilder().addComponents(confirm),
        ],
    };
}

function renderPreview(guild, plan) {
    const embed = embeds.panel("Setup Preview", "Review planned changes before building.", [
        { name: "Roles", value: [
            plan.roles.staff.action==="reuse" ? `> Reuse <@&${plan.roles.staff.roleId}>` : plan.roles.staff.action==="create" ? `> Create \`${plan.roles.staff.name}\`` : plan.roles.staff.action==="repair" ? `> Repair <@&${plan.roles.staff.roleId}>` : `> Staff: ${plan.roles.staff.reason||"skip"}`,
            plan.roles.mod.action==="reuse" ? `> Reuse <@&${plan.roles.mod.roleId}>` : plan.roles.mod.action==="create" ? `> Create \`${plan.roles.mod.name}\`` : plan.roles.mod.action==="repair" ? `> Repair <@&${plan.roles.mod.roleId}>` : `> Mod: ${plan.roles.mod.reason||"skip"}`,
        ].join("\n"), inline: false },
        { name: "Channels", value: [
            plan.channels.log.action==="reuse" ? `> Reuse <#${plan.channels.log.id}>` : plan.channels.log.action==="repair" ? `> Repair <#${plan.channels.log.id}>` : plan.channels.log.action==="create" ? `> Create \`#${plan.channels.log.name}\`` : `> Logs: blocked`,
            plan.channels.modLog.action==="reuse" ? `> Reuse <#${plan.channels.modLog.id}>` : plan.channels.modLog.action==="repair" ? `> Repair <#${plan.channels.modLog.id}>` : plan.channels.modLog.action==="create" ? `> Create \`#${plan.channels.modLog.name}\`` : `> Mod-log: blocked`,
            plan.channels.welcome.action==="reuse" ? `> Reuse <#${plan.channels.welcome.id}>` : plan.channels.welcome.action==="create" ? `> Create \`#${plan.channels.welcome.name}\`` : `> Welcome: blocked`,
        ].join("\n"), inline: false },
        { name: "Categories", value: [
            plan.categories.logs.action==="reuse" ? `> Reuse \`${plan.categories.logs.name}\`` : plan.categories.logs.action==="create" ? `> Create \`${plan.categories.logs.name}\`` : `> Logs category: blocked`,
            plan.categories.orders.action==="reuse" ? `> Reuse \`${plan.categories.orders.name}\`` : plan.categories.orders.action==="create" ? `> Create \`${plan.categories.orders.name}\`` : `> Orders category: blocked`,
        ].join("\n"), inline: false },
        { name: "Configuration", value: "> Guild configuration will be updated", inline: false },
        ...(plan.permissions.warnings.length ? [{ name: "Warnings", value: plan.permissions.warnings.map((w)=>`> ${w}`).join("\n") }] : []),
        ...(plan.hierarchy && !plan.hierarchy.ok ? [{ name: "Hierarchy", value: plan.hierarchy.problems.map((p)=>`> ${p.reason}`).join("\n") }] : []),
    ], {
        footer: `No changes made.`,
    });
    embed.setThumbnail(guild.iconURL({ size: 128 }) ?? null);
    const back = new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary);
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(back)] };
}

async function executePlan(guild, plan, client) {
    const results = { roles: {}, categories: {}, channels: {}, config: null };
    // Roles — create if needed
    for (const key of ["staff", "mod"]) {
        const r = plan.roles[key];
        if (!r) continue;
        if (r.action === "create") {
            try {
                const created = await guild.roles.create({ name: r.name, reason: "autosetup" });
                // Try to position below bot if possible (do not move above bot)
                const me = guild.members.me;
                if (me && created.position >= me.roles.highest.position) {
                    await created.setPosition(me.roles.highest.position - 1).catch(()=>{});
                }
                results.roles[key] = { id: created.id, name: created.name, action: "created" };
                r.roleId = created.id; // for later permission use
            } catch (e) {
                logger.error("autosetup", `create ${key} failed`, e);
                results.roles[key] = { action: "blocked", reason: String(e.message).slice(0,100) };
            }
        } else if (r.action === "reuse" || r.action === "repair") {
            results.roles[key] = { id: r.roleId, name: r.name, action: r.action==="repair"?"repaired":"reused" };
        } else {
            results.roles[key] = { action: r.action };
        }
    }

    // Categories
    for (const key of ["logs", "orders"]) {
        const c = plan.categories[key];
        if (!c) continue;
        if (c.action === "reuse") {
            const ch = guild.channels.cache.get(c.id);
            results.categories[key] = { id: ch?.id, name: ch?.name ?? c.name, action: "reused" };
        } else if (c.action === "create") {
            try {
                const created = await ensureCategory(guild, c.name);
                const isNew = created.name === c.name && created.createdAt && Date.now() - created.createdAt.getTime() < 5000;
                results.categories[key] = { id: created.id, name: created.name, action: isNew ? "created" : "reused" };
            } catch (e) {
                logger.error("autosetup", `create cat ${key} failed`, e);
                results.categories[key] = { action: "blocked" };
            }
        } else {
            results.categories[key] = { action: c.action };
        }
    }

    // Channels
    const allowIds = [results.roles.staff?.id, results.roles.mod?.id].filter(Boolean);
    // Also include original selections that were reused (if create failed, fallback to ids)
    const allAllow = [...new Set([...allowIds, ...[plan.roles.staff?.roleId, plan.roles.mod?.roleId].filter(Boolean)])];

    for (const key of ["log", "modLog", "welcome"]) {
        const chPlan = plan.channels[key];
        if (!chPlan) continue;
        const parentForLog = key==="welcome" ? null : (results.categories.logs?.id ? guild.channels.cache.get(results.categories.logs.id) : null);
        const overwrites = key==="welcome" ? [] : [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            ...allAllow.map((id)=>({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
        ];
        if (chPlan.action === "reuse" || chPlan.action === "repair") {
            const ch = guild.channels.cache.get(chPlan.id);
            if (ch) {
                // Ensure perms for logs/modlog (welcome no hide)
                if (key !== "welcome" && allAllow.length) {
                    await hideFromMembers(guild, ch.parentId ? guild.channels.cache.get(ch.parentId) ?? ch : ch, allAllow).catch(()=>{});
                    // Also ensure channel itself has correct overwrites if it was mis-placed
                    if (ch.parentId !== parentForLog?.id && parentForLog) {
                        await ch.setParent(parentForLog.id).catch(()=>{});
                    }
                }
                results.channels[key] = { id: ch.id, name: ch.name, action: chPlan.action==="repair"?"repaired":"reused" };
            } else {
                // fell through to create
                try {
                    const created = await ensureTextChannel(guild, chPlan.name, parentForLog, overwrites);
                    results.channels[key] = { id: created.id, name: created.name, action: "created" };
                } catch (e) { results.channels[key] = { action: "blocked" }; }
            }
        } else if (chPlan.action === "create") {
            try {
                const created = await ensureTextChannel(guild, chPlan.name, parentForLog, overwrites);
                // Determine if reused or created (ensureTextChannel returns existing if matched)
                const wasCreated = created.name.toLowerCase() === chPlan.name.toLowerCase();
                // Check timestamp to decide? Use simple: if plan said create but we found existing via ensure, it's reused
                // We'll check if channel already existed before call — our ensure already checked cache, so if we are here plan didn't find matching, so it's new
                results.channels[key] = { id: created.id, name: created.name, action: "created" };
            } catch (e) {
                logger.error("autosetup", `create ch ${key} failed`, e);
                results.channels[key] = { action: "blocked" };
            }
        } else {
            results.channels[key] = { action: chPlan.action };
        }
    }

    // Ensure logs category perms after all
    if (results.categories.logs?.id && allAllow.length) {
        const cat = guild.channels.cache.get(results.categories.logs.id);
        if (cat) await hideFromMembers(guild, cat, allAllow).catch((e)=>logger.error("autosetup","cat hide failed",e));
    }

    // Patch config (upsert handles new guild)
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

    try {
        await client.services.settings.patch(guild.id, patch);
        results.config = { action: "saved" };
    } catch (e) {
        logger.error("autosetup", "patch failed", e);
        results.config = { action: "blocked", reason: String(e.message).slice(0,100) };
    }

    return results;
}

export default {
    data: new SlashCommandBuilder()
        .setName("autosetup")
        .setDescription("Set up roles, log channels, and order channels for this server."),
    category: "Config",
    async execute(interaction) {
        const client = interaction.client;
        const member = interaction.member;
        const guild = interaction.guild;
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ embeds: [embeds.error("Missing permission", "You need **Manage Server** permission to run auto-setup.")], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Preselect detected roles
        const detectedStaff = detectStaffRole(guild);
        const detectedMod = detectModeratorRole(guild);
        const initial = { staff: detectedStaff ? [detectedStaff.id] : [], mod: detectedMod ? [detectedMod.id] : [], createMissing: false };
        selections.set(guild.id, initial);

        const handlerStaff = async (i) => {
            if (!i.isStringSelectMenu()) return;
            const sel = selections.get(i.guild.id) ?? { staff: [], mod: [], createMissing: false };
            sel.staff = i.values.filter((v) => v !== "none");
            selections.set(i.guild.id, sel);
            await i.update(renderSetup(i.guild)).catch(()=>{});
        };
        const handlerMod = async (i) => {
            if (!i.isStringSelectMenu()) return;
            const sel = selections.get(i.guild.id) ?? { staff: [], mod: [], createMissing: false };
            sel.mod = i.values.filter((v) => v !== "none");
            selections.set(i.guild.id, sel);
            await i.update(renderSetup(i.guild)).catch(()=>{});
        };
        const handlerToggle = async (i) => {
            if (!i.isButton()) return;
            const sel = selections.get(i.guild.id) ?? { staff: [], mod: [], createMissing: false };
            sel.createMissing = !sel.createMissing;
            selections.set(i.guild.id, sel);
            await i.update(renderSetup(i.guild)).catch(()=>{});
        };
        const handlerPreview = async (i) => {
            if (!i.isButton()) return;
            await i.deferUpdate().catch(()=>{});
            const sel = selections.get(i.guild.id) ?? { staff: [], mod: [], createMissing: false };
            const config = await client.services.settings.get(i.guild.id).catch(()=>null);
            const plan = await buildSetupPlan(i.guild, sel, config, {});
            await i.editReply(renderPreview(i.guild, plan)).catch(()=>{});
        };
        const handlerRepair = async (i) => {
            if (!i.isButton()) return;
            await i.deferUpdate().catch(()=>{});
            const sel = selections.get(i.guild.id) ?? { staff: [], mod: [], createMissing: false };
            // Repair needs valid role selections — use detected or existing config as fallback
            const config = await client.services.settings.get(i.guild.id).catch(()=>null);
            if (!sel.staff.length && config?.staffRoleIds?.length) sel.staff = config.staffRoleIds.slice(0,1);
            if (!sel.mod.length && config?.moderatorRoleIds?.length) sel.mod = config.moderatorRoleIds.slice(0,1);
            const plan = await buildSetupPlan(i.guild, sel, config, { repairMode: true });
            // Validate hierarchy/permissions before repair
            if (plan.permissions.warnings.length) {
                await i.editReply({ embeds: [embeds.warn("Repair blocked", plan.permissions.warnings.join("\n"))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(()=>{});
                return;
            }
            if (plan.hierarchy && !plan.hierarchy.ok) {
                await i.editReply({ embeds: [embeds.warn("Hierarchy blocked", plan.hierarchy.problems.map((p)=>p.reason).join("\n"))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(()=>{});
                return;
            }
            const results = await executePlan(i.guild, plan, client);
            const embed = embeds.success("Repair complete.", "Only broken resources were repaired.", [
                { name: "ROLES", value: [
                    results.roles.staff ? `Staff: ${results.roles.staff.id?`<@&${results.roles.staff.id}>`:`\`${results.roles.staff.name??"—"}\``} (${results.roles.staff.action})` : "—",
                    results.roles.mod ? `Moderator: ${results.roles.mod.id?`<@&${results.roles.mod.id}>`:`\`${results.roles.mod.name??"—"}\``} (${results.roles.mod.action})` : "—",
                ].join("\n") },
                { name: "CATEGORIES", value: [
                    results.categories.logs ? `${results.categories.logs.name} (${results.categories.logs.action})` : "—",
                    results.categories.orders ? `${results.categories.orders.name} (${results.categories.orders.action})` : "—",
                ].join("\n") },
                { name: "CHANNELS", value: [
                    results.channels.log ? `<#${results.channels.log.id}> (${results.channels.log.action})` : "—",
                    results.channels.modLog ? `<#${results.channels.modLog.id}> (${results.channels.modLog.action})` : "—",
                    results.channels.welcome ? `<#${results.channels.welcome.id}> (${results.channels.welcome.action})` : "—",
                ].join("\n") },
                { name: "CONFIGURATION", value: results.config?.action==="saved" ? "Guild configuration saved" : `${results.config?.reason||"failed"}` },
            ]);
            await i.editReply({ embeds: [embed], components: [] }).catch(()=>{});
            selections.delete(i.guild.id);
        };
        const handlerBack = async (i) => {
            if (!i.isButton()) return;
            await i.update(renderSetup(i.guild)).catch(()=>{});
        };
        const handlerConfirm = async (i) => {
            if (!i.isButton()) return;
            await i.deferUpdate().catch(()=>{});
            const sel = selections.get(i.guild.id) ?? { staff: [], mod: [], createMissing: false };
            const config = await client.services.settings.get(i.guild.id).catch(()=>null);
            const plan = await buildSetupPlan(i.guild, sel, config, {});
            // Validation before run
            if (!sel.staff.length && plan.roles.staff.action==="skip" && !plan.roles.staff.roleId) {
                // Allow auto-detected or create path — check plan
                if (plan.roles.staff.action==="skip") {
                    await i.editReply({ embeds: [embeds.warn("Roles required", "Please select a Staff role or enable **Create missing roles**.")], components: [] }).catch(()=>{});
                    selections.delete(i.guild.id);
                    return;
                }
            }
            if (!sel.mod.length && plan.roles.mod.action==="skip") {
                if (plan.roles.mod.action==="skip") {
                    await i.editReply({ embeds: [embeds.warn("Roles required", "Please select a Moderator role or enable **Create missing roles**.")], components: [] }).catch(()=>{});
                    selections.delete(i.guild.id);
                    return;
                }
            }
            if (plan.permissions.warnings.length) {
                await i.editReply({ embeds: [embeds.warn("Missing bot permissions", plan.permissions.warnings.join("\n") + "\n\nGive the bot **Manage Channels** and **Manage Roles** then try again.")], components: [] }).catch(()=>{});
                selections.delete(i.guild.id);
                return;
            }
            if (plan.hierarchy && !plan.hierarchy.ok) {
                await i.editReply({ embeds: [embeds.warn("Hierarchy blocked", plan.hierarchy.problems.map((p)=>p.reason).join("\n") + "\n\nMove the bot role above the target roles.")], components: [] }).catch(()=>{});
                selections.delete(i.guild.id);
                return;
            }
            try {
                const results = await executePlan(i.guild, plan, client);
                const embed = embeds.success("Setup complete.", "Per-server configuration saved.", [
                    { name: "ROLES", value: [
                        results.roles.staff ? `Staff: ${results.roles.staff.id?`<@&${results.roles.staff.id}>`:`\`${results.roles.staff.name??"—"}\``} (${results.roles.staff.action})` : "—",
                        results.roles.mod ? `Moderator: ${results.roles.mod.id?`<@&${results.roles.mod.id}>`:`\`${results.roles.mod.name??"—"}\``} (${results.roles.mod.action})` : "—",
                    ].join("\n") },
                    { name: "CATEGORIES", value: [
                        results.categories.logs ? `${results.categories.logs.name} (${results.categories.logs.action})` : "—",
                        results.categories.orders ? `${results.categories.orders.name} (${results.categories.orders.action})` : "—",
                    ].join("\n") },
                    { name: "CHANNELS", value: [
                        results.channels.log ? `<#${results.channels.log.id}> (${results.channels.log.action})` : "—",
                        results.channels.modLog ? `<#${results.channels.modLog.id}> (${results.channels.modLog.action})` : "—",
                        results.channels.welcome ? `<#${results.channels.welcome.id}> (${results.channels.welcome.action})` : "—",
                    ].join("\n") },
                    { name: "CONFIGURATION", value: results.config?.action==="saved" ? "Guild configuration saved" : `${results.config?.reason||"failed"}` },
                ]);
                await i.editReply({ embeds: [embed], components: [] }).catch(()=>{});
            } catch (e) {
                logger.error("autosetup", "run failed", e);
                await i.editReply({ embeds: [embeds.error("Setup failed", "Could not finish setup. Ensure the bot has **Manage Channels** and **Manage Roles**.")], components: [] }).catch(()=>{});
            }
            selections.delete(i.guild.id);
        };

        client.components.set("pulse:setup:staff", handlerStaff);
        client.components.set("pulse:setup:mod", handlerMod);
        client.components.set("pulse:setup:toggleCreate", handlerToggle);
        client.components.set("pulse:setup:preview", handlerPreview);
        client.components.set("pulse:setup:repair", handlerRepair);
        client.components.set("pulse:setup:back", handlerBack);
        client.components.set("pulse:setup:confirm", handlerConfirm);

        await interaction.editReply(renderSetup(guild));
    },
};
