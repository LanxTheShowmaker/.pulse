import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits, MessageFlags } from "discord.js";
import { success, error, panel, info } from "../../design/embeds.js";
import { EconomyService, COOLDOWNS, WORK_JOBS, CRIME_OPTIONS, SLOT_SYMBOLS, formatMs } from "../../services/economy.js";

const E = {
    wallet: "Wallet",
    bank: "Bank",
    streak: "Streak",
    cooldown: "Cooldown",
};

function bar(current, max, len = 10) {
    const filled = Math.round((current / max) * len);
    return "█".repeat(filled) + "░".repeat(len - filled);
}

function cooldownBar(remaining, total) {
    const elapsed = total - remaining;
    return bar(elapsed, total, 8);
}

export default {
    data: new SlashCommandBuilder()
        .setName("economy")
        .setDescription("Economy system")
        .addSubcommand(sub => sub.setName("balance").setDescription("Check wallet, bank, and stats")
            .addUserOption(o => o.setName("target").setDescription("User to check").setRequired(false)))
        .addSubcommand(sub => sub.setName("daily").setDescription("Claim daily reward"))
        .addSubcommand(sub => sub.setName("weekly").setDescription("Claim weekly reward"))
        .addSubcommand(sub => sub.setName("work").setDescription("Work a random job"))
        .addSubcommand(sub => sub.setName("crime").setDescription("Commit a crime"))
        .addSubcommand(sub => sub.setName("rob").setDescription("Rob another user")
            .addUserOption(o => o.setName("target").setDescription("User to rob").setRequired(true)))
        .addSubcommand(sub => sub.setName("slots").setDescription("Play the slot machine")
            .addIntegerOption(o => o.setName("bet").setDescription("Amount to bet").setRequired(true)))
        .addSubcommand(sub => sub.setName("deposit").setDescription("Deposit coins into your bank")
            .addIntegerOption(o => o.setName("amount").setDescription("Amount to deposit (or 'all')").setRequired(true)))
        .addSubcommand(sub => sub.setName("withdraw").setDescription("Withdraw coins from your bank")
            .addIntegerOption(o => o.setName("amount").setDescription("Amount to withdraw (or 'all')").setRequired(true)))
        .addSubcommand(sub => sub.setName("gift").setDescription("Gift coins to someone")
            .addUserOption(o => o.setName("target").setDescription("User to gift").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount to gift").setRequired(true)))
        .addSubcommand(sub => sub.setName("leaderboard").setDescription("Richest users"))
        .addSubcommand(sub => sub.setName("history").setDescription("Your transaction history"))
        // Admin
        .addSubcommand(sub => sub.setName("admin-give").setDescription("Give coins to a user")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)))
        .addSubcommand(sub => sub.setName("admin-take").setDescription("Take coins from a user")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)))
        .addSubcommand(sub => sub.setName("admin-set").setDescription("Set a user's balance")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("New wallet balance").setRequired(true)))
        .addSubcommand(sub => sub.setName("admin-reset").setDescription("Reset a user's economy")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true)))
        .addSubcommand(sub => sub.setName("admin-bank").setDescription("Set a user's bank balance")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("New bank balance").setRequired(true))),

    async execute(interaction) {
        const { economy } = interaction.client.services;
        const sub = interaction.options.getSubcommand();
        const isAdmin = sub.startsWith("admin-");

        if (isAdmin) {
            const isMod = await interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            if (!isMod) return interaction.reply({ embeds: [error("Denied", "You need Manage Server permission.")], flags: MessageFlags.Ephemeral });
        }

        switch (sub) {
            case "balance":      return this.handleBalance(interaction, economy);
            case "daily":        return this.handleDaily(interaction, economy);
            case "weekly":       return this.handleWeekly(interaction, economy);
            case "work":         return this.handleWork(interaction, economy);
            case "crime":        return this.handleCrime(interaction, economy);
            case "rob":          return this.handleRob(interaction, economy);
            case "slots":        return this.handleSlots(interaction, economy);
            case "deposit":      return this.handleDeposit(interaction, economy);
            case "withdraw":     return this.handleWithdraw(interaction, economy);
            case "gift":         return this.handleGift(interaction, economy);
            case "leaderboard":  return this.handleLeaderboard(interaction, economy);
            case "history":      return this.handleHistory(interaction, economy);
            case "admin-give":   return this.handleAdminGive(interaction, economy);
            case "admin-take":   return this.handleAdminTake(interaction, economy);
            case "admin-set":    return this.handleAdminSet(interaction, economy);
            case "admin-reset":  return this.handleAdminReset(interaction, economy);
            case "admin-bank":   return this.handleAdminBank(interaction, economy);
        }
    },

    // ── Balance ──

    async handleBalance(interaction, economy) {
        const target = interaction.options.getUser("target") ?? interaction.user;
        const profile = await economy.getOrCreate(interaction.guild.id, target.id);
        const total = profile.balance + profile.bank;

        const embed = panel(`💰 ${target.username}`, [
            `${E.wallet}: **${profile.balance.toLocaleString()}** coins`,
            `${E.bank}: **${profile.bank.toLocaleString()}** coins`,
            ``,
            `**Total: ${total.toLocaleString()} coins**`,
        ].join("\n"))
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "Daily Streak", value: `${profile.dailyStreak} 🔥`, inline: true },
                { name: "Weekly Streak", value: `${profile.weeklyStreak} 🔥`, inline: true },
                { name: "Total Earned", value: profile.totalEarned.toLocaleString(), inline: true },
            );

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    // ── Daily ──

    async handleDaily(interaction, economy) {
        const result = await economy.claimDaily(interaction.guild.id, interaction.user.id);
        if (!result.ok) return interaction.reply({
            embeds: [error("Cooldown", `${cooldownBar(result.remaining, COOLDOWNS.daily)} ${formatMs(result.remaining)} left`)],
            flags: MessageFlags.Ephemeral,
        });

        const streak = result.streak > 1 ? `\n🔥 Streak: **${result.streak}** (+${Math.min(result.streak, 30) * 10} bonus)` : "";
        await interaction.reply({
            embeds: [success("Daily Claimed", `+${result.amount.toLocaleString()} coins${streak}\nBalance: **${result.balance.toLocaleString()}**`)],
        });
    },

    // ── Weekly ──

    async handleWeekly(interaction, economy) {
        const result = await economy.claimWeekly(interaction.guild.id, interaction.user.id);
        if (!result.ok) return interaction.reply({
            embeds: [error("Cooldown", `${cooldownBar(result.remaining, COOLDOWNS.weekly)} ${formatMs(result.remaining)} left`)],
            flags: MessageFlags.Ephemeral,
        });

        const streak = result.streak > 1 ? `\n🔥 Streak: **${result.streak}** (+${Math.min(result.streak, 12) * 50} bonus)` : "";
        await interaction.reply({
            embeds: [success("Weekly Claimed", `+${result.amount.toLocaleString()} coins${streak}\nBalance: **${result.balance.toLocaleString()}**`)],
        });
    },

    // ── Work ──

    async handleWork(interaction, economy) {
        const result = await economy.work(interaction.guild.id, interaction.user.id);
        if (!result.ok) return interaction.reply({
            embeds: [error("Cooldown", `${cooldownBar(result.remaining, COOLDOWNS.work)} ${formatMs(result.remaining)} left`)],
            flags: MessageFlags.Ephemeral,
        });

        await interaction.reply({
            embeds: [success(`${result.job.emoji} ${result.job.job}`, `You earned **${result.amount.toLocaleString()}** coins\nBalance: **${result.balance.toLocaleString()}**`)],
        });
    },

    // ── Crime ──

    async handleCrime(interaction, economy) {
        const result = await economy.crime(interaction.guild.id, interaction.user.id);
        if (!result.ok) return interaction.reply({
            embeds: [error("Cooldown", `${cooldownBar(result.remaining, COOLDOWNS.crime)} ${formatMs(result.remaining)} left`)],
            flags: MessageFlags.Ephemeral,
        });

        if (result.success) {
            await interaction.reply({
                embeds: [success(`${result.crime.emoji} Crime Successful`, `**${result.crime.crime}**\n+**${result.amount.toLocaleString()}** coins\nBalance: **${result.balance.toLocaleString()}**`)],
            });
        } else {
            await interaction.reply({
                embeds: [error(`${result.crime.emoji} Crime Failed`, `**${result.crime.crime}**\nYou were caught and fined **${result.amount.toLocaleString()}** coins\nBalance: **${result.balance.toLocaleString()}**`)],
            });
        }
    },

    // ── Rob ──

    async handleRob(interaction, economy) {
        const target = interaction.options.getUser("target");
        const result = await economy.rob(interaction.guild.id, interaction.user.id, target.id);

        if (!result.ok) {
            if (result.remaining) return interaction.reply({
                embeds: [error("Cooldown", `${cooldownBar(result.remaining, COOLDOWNS.rob)} ${formatMs(result.remaining)} left`)],
                flags: MessageFlags.Ephemeral,
            });
            return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
        }

        if (result.caught) {
            await interaction.reply({
                embeds: [error("🚨 Caught!", `You tried to rob <@${target.id}> but got caught!\nFined **${result.amount.toLocaleString()}** coins`)],
            });
        } else {
            await interaction.reply({
                embeds: [success("Robbery Successful", `Stole **${result.amount.toLocaleString()}** coins from <@${target.id}>\nBalance: **${result.balance.toLocaleString()}**`)],
            });
        }
    },

    // ── Slots ──

    async handleSlots(interaction, economy) {
        const bet = interaction.options.getInteger("bet");
        if (bet <= 0) return interaction.reply({ embeds: [error("Invalid", "Bet must be positive.")], flags: MessageFlags.Ephemeral });

        const result = await economy.slots(interaction.guild.id, interaction.user.id, bet);
        if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });

        const display = `**[ ${result.reels.join(" | ")} ]**`;

        if (result.multiplier > 0) {
            const label = result.multiplier >= 10 ? "JACKPOT" : result.multiplier >= 7 ? "MEGA WIN" : "WIN";
            await interaction.reply({
                embeds: [success(`🎰 ${label}`, `${display}\n+**${result.winAmount.toLocaleString()}** coins (x${result.multiplier})\nBalance: **${result.balance.toLocaleString()}**`)],
            });
        } else {
            await interaction.reply({
                embeds: [error("🎰 Lose", `${display}\n-${bet.toLocaleString()} coins\nBalance: **${result.balance.toLocaleString()}**`)],
            });
        }
    },

    // ── Deposit / Withdraw ──

    async handleDeposit(interaction, economy) {
        const amount = interaction.options.getInteger("amount");
        const result = await economy.deposit(interaction.guild.id, interaction.user.id, amount);
        if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
        await interaction.reply({
            embeds: [success("Deposited", `Wallet: **${result.wallet.toLocaleString()}** → Bank: **${result.bank.toLocaleString()}**`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleWithdraw(interaction, economy) {
        const amount = interaction.options.getInteger("amount");
        const result = await economy.withdraw(interaction.guild.id, interaction.user.id, amount);
        if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
        await interaction.reply({
            embeds: [success("Withdrawn", `Bank: **${result.bank.toLocaleString()}** → Wallet: **${result.wallet.toLocaleString()}**`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    // ── Gift ──

    async handleGift(interaction, economy) {
        const target = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        if (target.id === interaction.user.id) return interaction.reply({ embeds: [error("Invalid", "Can't gift yourself.")], flags: MessageFlags.Ephemeral });

        const result = await economy.gift(interaction.guild.id, interaction.user.id, target.id, amount);
        if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
        await interaction.reply({
            embeds: [success("Gifted", `Gave **${amount.toLocaleString()}** coins to <@${target.id}>`)],
        });
    },

    // ── Leaderboard ──

    async handleLeaderboard(interaction, economy) {
        const list = await economy.getLeaderboard(interaction.guild.id, 10);
        if (!list.length) return interaction.reply({ embeds: [panel("Leaderboard", "No data yet.")] });

        const medals = ["🥇", "🥈", "🥉"];
        const lines = list.map((e, i) => {
            const medal = medals[i] ?? `\`${i + 1}.\``;
            const total = e.balance + e.bank;
            return `${medal} <@${e.userId}> — **${total.toLocaleString()}** coins`;
        });

        await interaction.reply({ embeds: [panel("💰 Richest Users", lines.join("\n"))] });
    },

    // ── History ──

    async handleHistory(interaction, economy) {
        const list = await economy.getHistory(interaction.guild.id, interaction.user.id, 15);
        if (!list.length) return interaction.reply({ embeds: [panel("History", "No transactions yet.")], flags: MessageFlags.Ephemeral });

        const typeIcons = { daily: "📅", weekly: "📆", work: "💼", crime_success: "✅", crime_fail: "❌", rob_caught: "🚨", slots: "🎰", gift_out: "🎁", gift_in: "📩", admin_give: "🔧", admin_take: "🔧" };

        const lines = list.map(t => {
            const icon = typeIcons[t.type] ?? "•";
            const sign = t.amount > 0 ? "+" : "";
            return `${icon} \`${t.type}\` ${sign}${t.amount.toLocaleString()} — <t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`;
        });

        await interaction.reply({ embeds: [panel("Transaction History", lines.join("\n"))], flags: MessageFlags.Ephemeral });
    },

    // ── Admin ──

    async handleAdminGive(interaction, economy) {
        const target = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        const result = await economy.adminGive(interaction.guild.id, target.id, amount, interaction.user.id);
        await interaction.reply({
            embeds: [success("Coins Given", `Gave **${amount.toLocaleString()}** coins to <@${target.id}>\nNew balance: **${result.balance.toLocaleString()}**`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleAdminTake(interaction, economy) {
        const target = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        const result = await economy.adminTake(interaction.guild.id, target.id, amount, interaction.user.id);
        await interaction.reply({
            embeds: [success("Coins Taken", `Took **${result.taken.toLocaleString()}** coins from <@${target.id}>\nNew balance: **${result.balance.toLocaleString()}**`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleAdminSet(interaction, economy) {
        const target = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        await economy.adminSet(interaction.guild.id, target.id, amount);
        await interaction.reply({
            embeds: [success("Balance Set", `Set <@${target.id}>'s wallet to **${amount.toLocaleString()}**`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleAdminReset(interaction, economy) {
        const target = interaction.options.getUser("target");
        await economy.resetUser(interaction.guild.id, target.id);
        await interaction.reply({
            embeds: [success("User Reset", `<@${target.id}>'s economy data has been wiped.`)],
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleAdminBank(interaction, economy) {
        const target = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        await economy.prisma.economy.upsert({
            where: { guildId_userId: { guildId: interaction.guild.id, userId: target.id } },
            create: { guildId: interaction.guild.id, userId: target.id, bank: amount },
            update: { bank: amount },
        });
        await interaction.reply({
            embeds: [success("Bank Set", `Set <@${target.id}>'s bank to **${amount.toLocaleString()}**`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
