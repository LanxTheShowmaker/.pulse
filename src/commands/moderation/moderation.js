import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { requireModerator, canModerate, ephemeral, confirmAction, parseDuration } from "./shared.js";
import { success, info, panel, stat } from "../../design/embeds.js";
import { row, button } from "../../design/components.js";
import { Theme, Brand } from "../../design/theme.js";

export default {
    category: "moderation",
    data: new SlashCommandBuilder()
        .setName("moderation")
        .setDescription("Moderation tools")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addSubcommand(sub => sub
            .setName("warn")
            .setDescription("Warn a user")
            .addUserOption(o => o.setName("target").setDescription("User to warn").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("ban")
            .setDescription("Ban a user")
            .addUserOption(o => o.setName("target").setDescription("User to ban").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
            .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 7d, 24h)").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("kick")
            .setDescription("Kick a user")
            .addUserOption(o => o.setName("target").setDescription("User to kick").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("timeout")
            .setDescription("Timeout a user")
            .addUserOption(o => o.setName("target").setDescription("User to timeout").setRequired(true))
            .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 10m, 2h, 7d)").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("unban")
            .setDescription("Unban a user")
            .addStringOption(o => o.setName("user-id").setDescription("User ID to unban").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("untimeout")
            .setDescription("Remove timeout from a user")
            .addUserOption(o => o.setName("target").setDescription("User to remove timeout from").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("case")
            .setDescription("View a moderation case")
            .addIntegerOption(o => o.setName("number").setDescription("Case number").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("cases")
            .setDescription("List recent moderation cases")
            .addUserOption(o => o.setName("target").setDescription("Filter by user").setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName("history")
            .setDescription("View a user's moderation history")
            .addUserOption(o => o.setName("target").setDescription("User to check").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("stats")
            .setDescription("View moderation statistics")
        )
        .addSubcommand(sub => sub
            .setName("note")
            .setDescription("Add a note to a user")
            .addUserOption(o => o.setName("target").setDescription("User to add note to").setRequired(true))
            .addStringOption(o => o.setName("content").setDescription("Note content").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("edit")
            .setDescription("Edit a case reason")
            .addIntegerOption(o => o.setName("number").setDescription("Case number").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("New reason").setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("resolve")
            .setDescription("Mark a case as resolved")
            .addIntegerOption(o => o.setName("number").setDescription("Case number").setRequired(true))
        ),

    async execute(interaction) {
        const { moderation, cases } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        // Check moderator
        const isMod = await requireModerator(interaction);
        if (!isMod) return ephemeral(interaction, "You do not have permission to use moderation commands.");

        switch (sub) {
            case "warn":    return this.handleWarn(interaction, moderation, cases);
            case "ban":     return this.handleBan(interaction, moderation, cases);
            case "kick":    return this.handleKick(interaction, moderation, cases);
            case "timeout": return this.handleTimeout(interaction, moderation, cases);
            case "unban":   return this.handleUnban(interaction, moderation, cases);
            case "untimeout": return this.handleUntimeout(interaction, moderation, cases);
            case "case":    return this.handleCase(interaction, cases);
            case "cases":   return this.handleCases(interaction, cases);
            case "history": return this.handleHistory(interaction, cases);
            case "stats":   return this.handleStats(interaction, cases);
            case "note":    return this.handleNote(interaction, cases);
            case "edit":    return this.handleEdit(interaction, cases);
            case "resolve": return this.handleResolve(interaction, cases);
        }
    },

    async handleWarn(interaction, moderation) {
        const target = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason");
        const check = await canModerate(interaction.user, target, interaction.guild);
        if (check !== true) return ephemeral(interaction, check);

        const confirmed = await confirmAction(interaction, `Warn <@${target.id}>?${reason ? `\nReason: ${reason}` : ""}`);
        if (!confirmed) return;

        const result = await moderation.warn(interaction.guild.id, interaction.user, target, reason);
        if (!result?.case) return interaction.editReply({ content: "Failed to create case." });

        const embed = success("User Warned")
            .setDescription(`<@${target.id}> has been warned.`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                stat("Reason", reason ?? "No reason"),
                stat("Case", `#${result.case.caseNumber}`),
            );
        await interaction.editReply({ content: "", embeds: [embed] });
    },

    async handleBan(interaction, moderation) {
        const target = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason");
        const duration = parseDuration(interaction.options.getString("duration"));
        const check = await canModerate(interaction.user, target, interaction.guild);
        if (check !== true) return ephemeral(interaction, check);

        const confirmed = await confirmAction(interaction, `Ban <@${target.id}>?${reason ? `\nReason: ${reason}` : ""}${duration ? `\nDuration: ${duration.text}` : ""}`);
        if (!confirmed) return;

        const result = await moderation.ban(interaction.guild.id, interaction.user, target, reason, duration);
        if (!result?.case) return interaction.editReply({ content: "Failed to ban user." });

        const embed = success("User Banned")
            .setDescription(`<@${target.id}> has been banned.`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                stat("Reason", reason ?? "No reason"),
                stat("Case", `#${result.case.caseNumber}`),
            );
        if (duration) embed.addFields(stat("Duration", duration.text));
        await interaction.editReply({ content: "", embeds: [embed] });
    },

    async handleKick(interaction, moderation) {
        const target = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason");
        const check = await canModerate(interaction.user, target, interaction.guild);
        if (check !== true) return ephemeral(interaction, check);

        const confirmed = await confirmAction(interaction, `Kick <@${target.id}>?${reason ? `\nReason: ${reason}` : ""}`);
        if (!confirmed) return;

        const result = await moderation.kick(interaction.guild.id, interaction.user, target, reason);
        if (!result?.case) return interaction.editReply({ content: "Failed to kick user." });

        const embed = success("User Kicked")
            .setDescription(`<@${target.id}> has been kicked.`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                stat("Reason", reason ?? "No reason"),
                stat("Case", `#${result.case.caseNumber}`),
            );
        await interaction.editReply({ content: "", embeds: [embed] });
    },

    async handleTimeout(interaction, moderation) {
        const target = interaction.options.getUser("target");
        const durationStr = interaction.options.getString("duration");
        const reason = interaction.options.getString("reason");
        const duration = parseDuration(durationStr);
        if (!duration) return ephemeral(interaction, "Invalid duration. Use formats like `10m`, `2h`, `7d`.");
        if (duration.ms > 2_419_200_000) return ephemeral(interaction, "Maximum timeout duration is 28 days.");

        const check = await canModerate(interaction.user, target, interaction.guild);
        if (check !== true) return ephemeral(interaction, check);

        const confirmed = await confirmAction(interaction, `Timeout <@${target.id}> for ${duration.text}?${reason ? `\nReason: ${reason}` : ""}`);
        if (!confirmed) return;

        const result = await moderation.timeout(interaction.guild.id, interaction.user, target, reason, duration);
        if (!result?.case) return interaction.editReply({ content: "Failed to timeout user." });

        const embed = success("User Timed Out")
            .setDescription(`<@${target.id}> has been timed out.`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                stat("Reason", reason ?? "No reason"),
                stat("Duration", duration.text),
                stat("Case", `#${result.case.caseNumber}`),
            );
        await interaction.editReply({ content: "", embeds: [embed] });
    },

    async handleUnban(interaction, moderation) {
        const userId = interaction.options.getString("user-id");
        const reason = interaction.options.getString("reason");

        const guild = interaction.guild;
        const ban = await guild.bans.fetch(userId).catch(() => null);
        if (!ban) return ephemeral(interaction, "User is not banned.");

        const confirmed = await confirmAction(interaction, `Unban <@${userId}>?`);
        if (!confirmed) return;

        await guild.members.unban(userId, reason ?? "Unbanned by moderator").catch(e => {
            return interaction.editReply({ content: `Failed: ${e.message}` });
        });

        await interaction.editReply({ content: "", embeds: [success("Unbanned", `<@${userId}> has been unbanned.`)] });
    },

    async handleUntimeout(interaction, moderation) {
        const target = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason");

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return ephemeral(interaction, "User not found in server.");
        if (!member.isCommunicationDisabled()) return ephemeral(interaction, "User does not have an active timeout.");

        const confirmed = await confirmAction(interaction, `Remove timeout from <@${target.id}>?`);
        if (!confirmed) return;

        await member.timeout(null, reason ?? "Timeout removed by moderator").catch(e => {
            return interaction.editReply({ content: `Failed: ${e.message}` });
        });

        await interaction.editReply({ content: "", embeds: [success("Timeout Removed", `<@${target.id}>'s timeout has been removed.`)] });
    },

    async handleCase(interaction, cases) {
        const number = interaction.options.getInteger("number");
        const case_ = await cases.get(interaction.guild.id, number);
        if (!case_) return ephemeral(interaction, `Case #${number} not found.`);

        const embed = panel(`Case #${case_.caseNumber}`, "")
            .addFields(
                stat("Case", `#${case_.caseNumber}`),
                stat("Target", `<@${case_.targetId}> (${case_.targetTag ?? "unknown"})`),
                stat("Moderator", `<@${case_.moderatorId}> (${case_.moderatorTag ?? "unknown"})`),
                stat("Action", case_.action),
                stat("Reason", case_.reason ?? "No reason"),
                stat("Status", case_.resolved ? `✅ Resolved by <@${case_.resolvedById}>` : "⏳ Open"),
            )
            .setThumbnail(interaction.guild.iconURL())
            .setTimestamp(case_.createdAt);

        if (case_.duration) embed.addFields(stat("Duration", case_.duration));
        if (case_.resolvedAt) embed.addFields(stat("Resolved At", `<t:${Math.floor(case_.resolvedAt.getTime() / 1000)}:R>`));

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    async handleCases(interaction, cases) {
        const target = interaction.options.getUser("target");
        const list = target
            ? await cases.byTarget(interaction.guild.id, target.id, 10)
            : await cases.recent(interaction.guild.id, 10);

        if (!list.length) return ephemeral(interaction, "No cases found.");

        const iconMap = { warn: "⚠️", ban: "🔨", kick: "👢", timeout: "⏰", note: "📝" };
        const lines = list.map(c => {
            const icon = iconMap[c.action.toLowerCase()] ?? "•";
            const timestamp = Math.floor(c.createdAt.getTime() / 1000);
            return `\`${icon} #${c.caseNumber}\` <@${c.targetId}> — ${c.action} — <t:${timestamp}:R>`;
        });
        const embed = panel("Recent Cases", lines.join("\n"));

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    async handleHistory(interaction, cases) {
        const target = interaction.options.getUser("target");
        const list = await cases.byTarget(interaction.guild.id, target.id, 15);

        const iconMap = { warn: "⚠️", ban: "🔨", kick: "👢", timeout: "⏰", note: "📝" };
        const lines = list.length
            ? list.map(c => {
                const icon = iconMap[c.action.toLowerCase()] ?? "•";
                const timestamp = Math.floor(c.createdAt.getTime() / 1000);
                return `\`${icon} ${c.action}\` — ${c.reason ?? "No reason"} — <t:${timestamp}:R>`;
            })
            : ["No cases found."];

        const embed = panel(`History: ${target.tag}`, lines.join("\n"))
            .setThumbnail(target.displayAvatarURL());

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    async handleStats(interaction, cases) {
        const stats = await cases.stats(interaction.guild.id);

        const embed = panel("Moderation Stats", "")
            .addFields(
                stat("Total Cases", stats.total),
                stat("Warns", stats.byAction?.warn ?? 0),
                stat("Bans", stats.byAction?.ban ?? 0),
                stat("Kicks", stats.byAction?.kick ?? 0),
                stat("Timeouts", stats.byAction?.timeout ?? 0),
            );

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    async handleNote(interaction, cases) {
        const target = interaction.options.getUser("target");
        const content = interaction.options.getString("content");

        await cases.addNote(interaction.guild.id, target.id, interaction.user.id, interaction.user.tag, content);
        await interaction.reply({ embeds: [success("Note Added", `Note added to <@${target.id}>.`)], flags: MessageFlags.Ephemeral });
    },

    async handleEdit(interaction, cases) {
        const number = interaction.options.getInteger("number");
        const reason = interaction.options.getString("reason");

        const case_ = await cases.get(interaction.guild.id, number);
        if (!case_) return ephemeral(interaction, `Case #${number} not found.`);

        await cases.edit(interaction.guild.id, number, reason);
        await interaction.reply({ embeds: [success("Case Edited", `Case #${number} reason updated.`)], flags: MessageFlags.Ephemeral });
    },

    async handleResolve(interaction, cases) {
        const number = interaction.options.getInteger("number");

        const case_ = await cases.get(interaction.guild.id, number);
        if (!case_) return ephemeral(interaction, `Case #${number} not found.`);
        if (case_.resolved) return ephemeral(interaction, `Case #${number} is already resolved.`);

        await cases.resolve(interaction.guild.id, number, interaction.user.id, interaction.user.tag);
        await interaction.reply({ embeds: [success("Resolved", `Case #${number} marked as resolved.`)], flags: MessageFlags.Ephemeral });
    },
};
