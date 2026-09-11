import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { containerReply, containerEdit, containerFollowUp } from "../../design/containers/base.js";
import { moderationActionPanel, banConfirmationPanel, kickConfirmationPanel, timeoutConfirmationPanel, warnConfirmationPanel } from "../../design/containers/moderation.js";
import { errorPanel, successPanel } from "../../design/containers/panels.js";
import { requireModerator, confirmAction, sendActionResult, canModerate } from "./shared.js";
import { logger } from "../../core/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("moderation")
        .setDescription("Moderation actions and case management")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub
            .setName("warn")
            .setDescription("Issue a formal warning")
            .addUserOption(opt => opt.setName("target").setDescription("Member to warn").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for warning").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("ban")
            .setDescription("Ban a member")
            .addUserOption(opt => opt.setName("target").setDescription("Member to ban").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for ban").setRequired(true))
            .addIntegerOption(opt => opt.setName("delete-days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7).setRequired(false)))
        .addSubcommand(sub => sub
            .setName("kick")
            .setDescription("Kick a member")
            .addUserOption(opt => opt.setName("target").setDescription("Member to kick").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for kick").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("timeout")
            .setDescription("Timeout a member")
            .addUserOption(opt => opt.setName("target").setDescription("Member to timeout").setRequired(true))
            .addStringOption(opt => opt.setName("duration").setDescription("Duration (e.g., 10m, 1h, 1d)").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for timeout").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("unwarn")
            .setDescription("Remove a warning")
            .addIntegerOption(opt => opt.setName("case").setDescription("Case number to remove").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for removal").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("untimeout")
            .setDescription("Remove a timeout")
            .addUserOption(opt => opt.setName("target").setDescription("Member to untimeout").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("unban")
            .setDescription("Unban a user")
            .addStringOption(opt => opt.setName("user-id").setDescription("User ID to unban").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("case")
            .setDescription("View a specific case")
            .addIntegerOption(opt => opt.setName("number").setDescription("Case number").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("cases")
            .setDescription("List recent cases")
            .addUserOption(opt => opt.setName("user").setDescription("Filter by user").setRequired(false))
            .addIntegerOption(opt => opt.setName("limit").setDescription("Max cases to show").setMinValue(1).setMaxValue(50).setRequired(false)))
        .addSubcommand(sub => sub
            .setName("history")
            .setDescription("View moderation history for a user")
            .addUserOption(opt => opt.setName("user").setDescription("User to view history for").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("stats")
            .setDescription("View moderation statistics")
            .addUserOption(opt => opt.setName("moderator").setDescription("Filter by moderator").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("note")
            .setDescription("Add a note to a user's record")
            .addUserOption(opt => opt.setName("target").setDescription("Member to note").setRequired(true))
            .addStringOption(opt => opt.setName("content").setDescription("Note content").setRequired(true)))
        .addSubcommand(sub => sub
            .setName("clearwarnings")
            .setDescription("Clear all warnings for a user")
            .addUserOption(opt => opt.setName("target").setDescription("Member to clear warnings for").setRequired(true))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("cleanup")
            .setDescription("Clean up messages")
            .addIntegerOption(opt => opt.setName("amount").setDescription("Number of messages (1-100)").setMinValue(1).setMaxValue(100).setRequired(true))
            .addUserOption(opt => opt.setName("user").setDescription("Filter by user").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("lock")
            .setDescription("Lock a channel")
            .addChannelOption(opt => opt.setName("channel").setDescription("Channel to lock").addChannelTypes(0).setRequired(false))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for lock").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("unlock")
            .setDescription("Unlock a channel")
            .addChannelOption(opt => opt.setName("channel").setDescription("Channel to unlock").addChannelTypes(0).setRequired(false))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for unlock").setRequired(false)))
        .addSubcommand(sub => sub
            .setName("raid")
            .setDescription("Raid protection status and controls")
            .addStringOption(opt => opt.setName("action").setDescription("Action to take").setRequired(true).addChoices(
                { name: "status", value: "status" },
                { name: "enable", value: "enable" },
                { name: "disable", value: "disable" }
            )))
        .addSubcommand(sub => sub
            .setName("fortress")
            .setDescription("Server lockdown (fortress mode)")
            .addStringOption(opt => opt.setName("action").setDescription("Action to take").setRequired(true).addChoices(
                { name: "status", value: "status" },
                { name: "enable", value: "enable" },
                { name: "disable", value: "disable" }
            )))
        .addSubcommand(sub => sub
            .setName("appeal")
            .setDescription("Manage case appeals")
            .addStringOption(opt => opt.setName("action").setDescription("Action to take").setRequired(true).addChoices(
                { name: "list", value: "list" },
                { name: "review", value: "review" }
            ))
            .addIntegerOption(opt => opt.setName("case").setDescription("Case number (for review)").setRequired(false))
            .addStringOption(opt => opt.setName("decision").setDescription("Decision (for review)").setRequired(false).addChoices(
                { name: "approve", value: "approve" },
                { name: "deny", value: "deny" }
            ))
            .addStringOption(opt => opt.setName("reason").setDescription("Reason for decision").setRequired(false))),
    category: "Moderation",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const client = interaction.client;

        try {
            if (sub === "warn") {
                await handleWarn(interaction, client);
            } else if (sub === "ban") {
                await handleBan(interaction, client);
            } else if (sub === "kick") {
                await handleKick(interaction, client);
            } else if (sub === "timeout") {
                await handleTimeout(interaction, client);
            } else if (sub === "unwarn") {
                await handleUnwarn(interaction, client);
            } else if (sub === "untimeout") {
                await handleUntimeout(interaction, client);
            } else if (sub === "unban") {
                await handleUnban(interaction, client);
            } else if (sub === "case") {
                await handleCaseView(interaction, client);
            } else if (sub === "cases") {
                await handleCaseList(interaction, client);
            } else if (sub === "history") {
                await handleHistory(interaction, client);
            } else if (sub === "stats") {
                await handleStats(interaction, client);
            } else if (sub === "note") {
                await handleNote(interaction, client);
            } else if (sub === "clearwarnings") {
                await handleClearWarnings(interaction, client);
            } else if (sub === "cleanup") {
                await handleCleanup(interaction, client);
            } else if (sub === "lock") {
                await handleLock(interaction, client);
            } else if (sub === "unlock") {
                await handleUnlock(interaction, client);
            } else if (sub === "raid") {
                await handleRaid(interaction, client);
            } else if (sub === "fortress") {
                await handleFortress(interaction, client);
            } else if (sub === "appeal") {
                await handleAppeal(interaction, client);
            }
        } catch (e) {
            logger.error("moderation", `subcommand ${sub} failed`, e);
            const reply = errorPanel("Failed", "An error occurred while processing this action.");
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ components: [reply], flags: MessageFlags.Ephemeral }).catch(() => {});
            } else {
                await interaction.reply({ components: [reply], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    }
};

async function handleWarn(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("target", true);
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    const reason = interaction.options.getString("reason", true);

    if (!target) {
        return containerReply(interaction, errorPanel("Not found", "That member is not in the server."), true);
    }

    if (!canModerate(interaction.member, target)) {
        return containerReply(interaction, errorPanel("Cannot moderate", "You cannot warn this member (higher or equal role, server owner, or bot cannot moderate them)."), true);
    }

    const confirmed = await confirmAction(interaction, warnConfirmationPanel(target.user, interaction.user, reason));
    if (!confirmed) return;

    await interaction.deferReply().catch(() => {});

    try {
        const c = await client.services.moderation.warn(interaction.guild, target, interaction.user, reason);

        try {
            await target.send({ components: [moderationActionPanel("WARN", target.user, interaction.user, reason, c.caseNumber)] }).catch(() => {});
        } catch {}

        await sendActionResult(interaction, "WARN", target.user, interaction.user, reason, c.caseNumber);
    } catch (e) {
        logger.error("moderation", "warn failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not issue warning."));
    }
}

async function handleBan(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("target", true);
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    const reason = interaction.options.getString("reason", true);
    const deleteDays = interaction.options.getInteger("delete-days") ?? 0;

    if (target && !canModerate(interaction.member, target)) {
        return containerReply(interaction, errorPanel("Cannot moderate", "You cannot ban this member (higher or equal role, server owner, or bot cannot moderate them)."), true);
    }

    if (target) {
        const confirmed = await confirmAction(interaction, banConfirmationPanel(target.user, interaction.user, reason, deleteDays));
        if (!confirmed) return;
    }

    await interaction.deferReply().catch(() => {});

    try {
        const c = await client.services.moderation.ban(interaction.guild, target || { id: user.id, tag: user.tag }, interaction.user, reason, deleteDays);
        const banned = await interaction.guild.bans.fetch(user.id).catch(() => null);
        if (!banned) {
            return containerEdit(interaction, errorPanel("Failed", "Could not ban user (Discord action did not succeed)."));
        }
        await sendActionResult(interaction, "BAN", user, interaction.user, reason, c.caseNumber, `${deleteDays} day(s) message deletion`);
    } catch (e) {
        logger.error("moderation", "ban failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not ban user."));
    }
}

async function handleKick(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("target", true);
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    const reason = interaction.options.getString("reason", true);

    if (!target) {
        return containerReply(interaction, errorPanel("Not found", "That member is not in the server."), true);
    }

    if (!canModerate(interaction.member, target)) {
        return containerReply(interaction, errorPanel("Cannot moderate", "You cannot kick this member (higher or equal role, server owner, or bot cannot moderate them)."), true);
    }

    const confirmed = await confirmAction(interaction, kickConfirmationPanel(target.user, interaction.user, reason));
    if (!confirmed) return;

    await interaction.deferReply().catch(() => {});

    try {
        const c = await client.services.moderation.kick(interaction.guild, target, interaction.user, reason);
        const stillPresent = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (stillPresent) {
            return containerEdit(interaction, errorPanel("Failed", "Could not kick user (Discord action did not succeed)."));
        }
        await sendActionResult(interaction, "KICK", target.user, interaction.user, reason, c.caseNumber);
    } catch (e) {
        logger.error("moderation", "kick failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not kick user."));
    }
}

async function handleTimeout(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const target = interaction.options.getMember("target", true);
    const durationStr = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason", true);

    const ms = parseDuration(durationStr);
    if (!ms || ms < 1000 || ms > 28 * 24 * 60 * 60 * 1000) {
        return containerReply(interaction, errorPanel("Invalid duration", "Duration must be between 1 second and 28 days (e.g., 10m, 1h, 1d)."), true);
    }

    if (!target.moderatable) {
        return containerReply(interaction, errorPanel("Cannot timeout", "I cannot timeout that member (higher/equal role or missing permissions)."), true);
    }

    if (!canModerate(interaction.member, target)) {
        return containerReply(interaction, errorPanel("Cannot moderate", "You cannot timeout this member (higher or equal role, server owner, or bot cannot moderate them)."), true);
    }

    const confirmed = await confirmAction(interaction, timeoutConfirmationPanel(target.user, interaction.user, reason, formatDuration(ms)));
    if (!confirmed) return;

    await interaction.deferReply().catch(() => {});

    try {
        const c = await client.services.moderation.timeout(target, interaction.user, ms, reason);
        const refreshed = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!refreshed || !refreshed.isCommunicationDisabled()) {
            return containerEdit(interaction, errorPanel("Failed", "Could not timeout user (Discord action did not succeed)."));
        }
        await sendActionResult(interaction, "TIMEOUT", target.user, interaction.user, reason, c.caseNumber, formatDuration(ms));
    } catch (e) {
        logger.error("moderation", "timeout failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not timeout user."));
    }
}

async function handleUnwarn(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const caseNumber = interaction.options.getInteger("case", true);
    const reason = interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
        await client.services.cases.resolve(interaction.guildId, caseNumber, { id: interaction.user.id, tag: interaction.user.tag });
        await containerEdit(interaction, successPanel("Warning removed", `Case #${caseNumber} has been resolved.`));
    } catch (e) {
        logger.error("moderation", "unwarn failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not remove warning."));
    }
}

async function handleUntimeout(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const target = interaction.options.getMember("target", true);
    const reason = interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply().catch(() => {});

    try {
        await target.disableCommunicationUntil(null, reason);
        await sendActionResult(interaction, "UNTIMEOUT", target.user, interaction.user, reason, null);
    } catch (e) {
        logger.error("moderation", "untimeout failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not remove timeout."));
    }
}

async function handleUnban(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const userId = interaction.options.getString("user-id", true);
    const reason = interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply().catch(() => {});

    try {
        await interaction.guild.bans.remove(userId, reason);
        await sendActionResult(interaction, "UNBAN", { id: userId, tag: `User ${userId}` }, interaction.user, reason, null);
    } catch (e) {
        logger.error("moderation", "unban failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not unban user (may not be banned)."));
    }
}

async function handleCaseView(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const caseNumber = interaction.options.getInteger("number", true);

    await interaction.deferReply().catch(() => {});

    try {
        const c = await client.services.cases.get(interaction.guildId, caseNumber);
        if (!c) {
            return containerEdit(interaction, errorPanel("Not found", `Case #${caseNumber} does not exist.`));
        }

        const panel = moderationActionPanel(c.action, { id: c.targetId, tag: c.targetTag }, { id: c.moderatorId, tag: c.moderatorTag }, c.reason, c.caseNumber, c.duration);
        await containerEdit(interaction, panel);
    } catch (e) {
        logger.error("moderation", "case view failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not retrieve case."));
    }
}

async function handleCaseList(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("user");
    const limit = interaction.options.getInteger("limit") ?? 25;

    await interaction.deferReply().catch(() => {});

    try {
        const cases = await client.services.cases.byTarget(
            interaction.guildId,
            user?.id ?? null,
            limit
        );

        if (!cases.length) {
            return containerEdit(interaction, errorPanel("No cases", "No cases found matching your criteria."));
        }

        const { createContainer, headerText, bodyText, divider, mutedText, spacer } = await import("../../design/containers/base.js");
        const { Brand } = await import("../../design/theme.js");

        const container = createContainer([
            headerText(`Cases`),
            divider(),
            ...cases.map(c => bodyText(`#${c.caseNumber} · ${c.action} · <@${c.targetId}> · ${c.reason ?? "No reason"} · ${c.resolved ? "Resolved" : "Active"}`)),
            spacer(),
            mutedText(Brand.footer),
        ]);

        await containerEdit(interaction, container);
    } catch (e) {
        logger.error("moderation", "case list failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not retrieve cases."));
    }
}

async function handleHistory(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("user", true);

    await interaction.deferReply().catch(() => {});

    try {
        const history = await client.services.moderation.getUserHistory(interaction.guildId, user.id);

        if (!history.history.length && !history.notes.length) {
            return containerEdit(interaction, errorPanel("No history", "No moderation history found for this user."));
        }

        const { createContainer, headerText, bodyText, divider, mutedText, spacer, subHeaderText } = await import("../../design/containers/base.js");
        const { Brand } = await import("../../design/theme.js");

        const container = createContainer([
            headerText(`History — ${user.tag}`),
            divider(),
            bodyText(`**User:** <@${user.id}> (\`${user.id}\`)`),
            bodyText(`**Warnings:** ${history.warns} | **Total:** ${history.total}`),
            spacer(),
        ]);

        if (history.history.length) {
            container.components.push(subHeaderText("Actions"));
            for (const c of history.history.slice(0, 20)) {
                const status = c.resolved ? "Resolved" : "Active";
                container.components.push(bodyText(`${status} #${c.caseNumber} · ${c.action} · ${c.reason ?? "No reason"} · <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:R>`));
            }
        }

        if (history.notes.length) {
            container.components.push(divider());
            container.components.push(subHeaderText("Notes"));
            for (const n of history.notes.slice(0, 10)) {
                container.components.push(bodyText(`<@${n.authorId}> · ${n.content.slice(0, 200)} · <t:${Math.floor(new Date(n.createdAt).getTime() / 1000)}:R>`));
            }
        }

        container.components.push(spacer());
        container.components.push(mutedText(Brand.footer));

        await containerEdit(interaction, container);
    } catch (e) {
        logger.error("moderation", "history failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not retrieve history."));
    }
}

async function handleStats(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const moderator = interaction.options.getUser("moderator");

    await interaction.deferReply().catch(() => {});

    try {
        const stats = await client.services.moderation.getModStats(interaction.guildId, moderator?.id);

        const { createContainer, headerText, bodyText, divider, mutedText, spacer, subHeaderText } = await import("../../design/containers/base.js");
        const { Brand } = await import("../../design/theme.js");

        const container = createContainer([
            headerText(`Moderation Stats`),
            divider(),
            bodyText(`**Scope:** ${moderator ? `Moderator <@${moderator.id}>` : "All moderators"}`),
            divider(),
        ]);

        if (moderator) {
            container.components.push(bodyText(`**Total actions:** ${stats.count}`));
            if (stats.recent?.length) {
                container.components.push(subHeaderText("Recent"));
                for (const c of stats.recent.slice(0, 10)) {
                    container.components.push(bodyText(`#${c.caseNumber} · ${c.action} · <@${c.targetId}> · <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:R>`));
                }
            }
        } else {
            container.components.push(bodyText(`**Total cases:** ${stats.total}`));
            if (stats.byAction?.length) {
                container.components.push(subHeaderText("By action"));
                for (const a of stats.byAction) {
                    container.components.push(bodyText(`${a.action}: ${a._count._all}`));
                }
            }
            if (stats.topMods?.length) {
                container.components.push(subHeaderText("Top moderators"));
                for (const m of stats.topMods.slice(0, 10)) {
                    container.components.push(bodyText(`<@${m.moderatorId}>: ${m._count.moderatorId}`));
                }
            }
        }

        container.components.push(spacer());
        container.components.push(mutedText(Brand.footer));

        await containerEdit(interaction, container);
    } catch (e) {
        logger.error("moderation", "stats failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not retrieve stats."));
    }
}

async function handleNote(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("target", true);
    const content = interaction.options.getString("content", true);

    await interaction.deferReply().catch(() => {});

    try {
        await client.services.cases.addNote(interaction.guildId, user.id, interaction.user.id, interaction.user.tag, content);
        await containerEdit(interaction, successPanel("Note added", `Added note for <@${user.id}>.`));
    } catch (e) {
        logger.error("moderation", "note failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not add note."));
    }
}

async function handleClearWarnings(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const user = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply().catch(() => {});

    try {
        // Resolve all warning cases for this user
        const cases = await client.services.cases.byTarget(interaction.guildId, user.id, 100);
        let resolved = 0;
        for (const c of cases) {
            if (c.action === "WARN" && !c.resolved) {
                await client.services.cases.resolve(interaction.guildId, c.caseNumber, { id: interaction.user.id, tag: interaction.user.tag });
                resolved++;
            }
        }

        await containerEdit(interaction, successPanel("Warnings cleared", `Resolved ${resolved} warning(s) for <@${user.id}>.`));
    } catch (e) {
        logger.error("moderation", "clearwarnings failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not clear warnings."));
    }
}

async function handleCleanup(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");

    await interaction.deferReply().catch(() => {});

    try {
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: amount + 1 });
        let toDelete = messages.filter(m => !m.pinned && (!user || m.author.id === user.id)).first(amount);
        
        if (!toDelete.length) {
            return containerEdit(interaction, errorPanel("Nothing to delete", "No deletable messages found."));
        }

        await channel.bulkDelete(toDelete, true);
        await containerEdit(interaction, successPanel("Cleanup complete", `Deleted ${toDelete.length} message(s).`));
    } catch (e) {
        logger.error("moderation", "cleanup failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not clean up messages."));
    }
}

async function handleLock(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const reason = interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply().catch(() => {});

    try {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            SendMessages: false,
            reason: `Locked by ${interaction.user.tag}: ${reason}`
        });

        await containerEdit(interaction, successPanel("Channel locked", `${channel} has been locked.\nReason: ${reason}`));
    } catch (e) {
        logger.error("moderation", "lock failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not lock channel."));
    }
}

async function handleUnlock(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const reason = interaction.options.getString("reason") || "No reason provided";

    await interaction.deferReply().catch(() => {});

    try {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            SendMessages: null,
            reason: `Unlocked by ${interaction.user.tag}: ${reason}`
        });

        await containerEdit(interaction, successPanel("Channel unlocked", `${channel} has been unlocked.\nReason: ${reason}`));
    } catch (e) {
        logger.error("moderation", "unlock failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not unlock channel."));
    }
}

async function handleRaid(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const action = interaction.options.getString("action", true);

    await interaction.deferReply().catch(() => {});

    try {
        if (action === "status") {
            const status = await client.services.raid.getStatus(interaction.guildId);
            const { createContainer, headerText, bodyText, divider, mutedText, spacer } = await import("../../design/containers/base.js");
            const { Brand } = await import("../../design/theme.js");

            const container = createContainer([
                headerText(`Raid Protection`),
                divider(),
                bodyText(`**Status:** ${status.active ? "Enabled" : "Disabled"}`),
                bodyText(`**Risk level:** ${status.risk}/100`),
                bodyText(`**Recent joins:** ${status.recentJoins}`),
                spacer(),
                mutedText(Brand.footer),
            ]);
            return containerEdit(interaction, container);
        }

        if (action === "enable") {
            await client.services.raid.enable(interaction.guildId);
            return containerEdit(interaction, successPanel("Raid protection enabled", "Raid protection is now active."));
        }

        if (action === "disable") {
            await client.services.raid.disable(interaction.guildId);
            return containerEdit(interaction, successPanel("Raid protection disabled", "Raid protection is now inactive."));
        }
    } catch (e) {
        logger.error("moderation", "raid failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not process raid command."));
    }
}

async function handleFortress(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const action = interaction.options.getString("action", true);

    await interaction.deferReply().catch(() => {});

    try {
        if (action === "status") {
            const state = await client.services.fortress.getState(interaction.guildId);
            const { createContainer, headerText, bodyText, divider, mutedText, spacer } = await import("../../design/containers/base.js");
            const { Brand } = await import("../../design/theme.js");

            const container = createContainer([
                headerText(`Fortress Mode`),
                divider(),
                bodyText(`**Status:** ${state.active ? "Enabled" : "Disabled"}`),
                bodyText(`**Enabled by:** ${state.enabledByTag ?? "Unknown"}`),
                bodyText(`**Started:** ${state.startedAt ? `<t:${Math.floor(new Date(state.startedAt).getTime() / 1000)}:R>` : "N/A"}`),
                spacer(),
                mutedText(Brand.footer),
            ]);
            return containerEdit(interaction, container);
        }

        if (action === "enable") {
            await client.services.fortress.enable(interaction.guildId, interaction.user);
            return containerEdit(interaction, successPanel("Fortress enabled", "Server is now in lockdown mode."));
        }

        if (action === "disable") {
            await client.services.fortress.disable(interaction.guildId);
            return containerEdit(interaction, successPanel("Fortress disabled", "Server lockdown has been lifted."));
        }
    } catch (e) {
        logger.error("moderation", "fortress failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not process fortress command."));
    }
}

async function handleAppeal(interaction, client) {
    if (!(await requireModerator(interaction))) return;

    const action = interaction.options.getString("action", true);

    await interaction.deferReply().catch(() => {});

    try {
        if (action === "list") {
            const appeals = await client.services.cases.listAppeals(interaction.guildId);
            
            const { createContainer, headerText, bodyText, divider, mutedText, spacer } = await import("../../design/containers/base.js");
            const { Brand } = await import("../../design/theme.js");

            const container = createContainer([
                headerText(`Appeals`),
                divider(),
            ]);

            if (!appeals.length) {
                container.components.push(bodyText("No pending appeals to review."));
            } else {
                for (const a of appeals.slice(0, 10)) {
                    container.components.push(bodyText(`#${a.caseNumber} · <@${a.appellantId}> · ${a.status} · <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R>`));
                }
            }

            container.components.push(spacer());
            container.components.push(mutedText(Brand.footer));

            return containerEdit(interaction, container);
        }

        if (action === "review") {
            const caseNumber = interaction.options.getInteger("case", true);
            const decision = interaction.options.getString("decision", true);
            const reason = interaction.options.getString("reason") || "No reason provided";

            const status = decision === "approve" ? "APPROVED" : decision === "deny" ? "DENIED" : String(decision).toUpperCase();
            const reviewed = await client.services.cases.reviewAppealByCase(interaction.guildId, caseNumber, { id: interaction.user.id, tag: interaction.user.tag }, status, reason);
            if (!reviewed) {
                return containerEdit(interaction, errorPanel("Not found", `No appeal found for case #${caseNumber}.`));
            }
            return containerEdit(interaction, successPanel("Appeal reviewed", `Appeal for case #${caseNumber} has been ${decision}.`));
        }
    } catch (e) {
        logger.error("moderation", "appeal failed", e);
        await containerEdit(interaction, errorPanel("Failed", "Could not process appeal."));
    }
}

function parseDuration(input) {
    const match = input.trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return value * mult[unit];
}

function formatDuration(ms) {
    if (!ms) return "unknown";
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}