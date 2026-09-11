import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { success, error, panel } from "../../design/embeds.js";

function formatMs(ms) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("economy")
        .setDescription("Economy commands")
        .addSubcommand(sub => sub.setName("balance").setDescription("Check your balance")
            .addUserOption(o => o.setName("target").setDescription("User to check").setRequired(false)))
        .addSubcommand(sub => sub.setName("daily").setDescription("Claim daily reward"))
        .addSubcommand(sub => sub.setName("weekly").setDescription("Claim weekly reward"))
        .addSubcommand(sub => sub.setName("gift").setDescription("Gift coins to someone")
            .addUserOption(o => o.setName("target").setDescription("User to gift").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount to gift").setRequired(true)))
        .addSubcommand(sub => sub.setName("leaderboard").setDescription("Economy leaderboard"))
        .addSubcommand(sub => sub.setName("history").setDescription("View transaction history")),

    async execute(interaction) {
        const { economy } = interaction.client.services;
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "balance": {
                const target = interaction.options.getUser("target") ?? interaction.user;
                const bal = await economy.getBalance(interaction.guild.id, target.id);
                await interaction.reply({
                    embeds: [panel(`${target.tag}`, `Balance: **${bal.toLocaleString()}** coins`)],
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "daily": {
                const result = await economy.claimDaily(interaction.guild.id, interaction.user.id);
                if (!result.ok) return interaction.reply({
                    embeds: [error("Cooldown", `Come back in ${formatMs(result.remaining)}.`)],
                    flags: MessageFlags.Ephemeral,
                });
                await interaction.reply({
                    embeds: [success("Daily Claimed", `+${result.amount.toLocaleString()} coins. Balance: **${result.balance.toLocaleString()}**`)],
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "weekly": {
                const result = await economy.claimWeekly(interaction.guild.id, interaction.user.id);
                if (!result.ok) return interaction.reply({
                    embeds: [error("Cooldown", `Come back in ${formatMs(result.remaining)}.`)],
                    flags: MessageFlags.Ephemeral,
                });
                await interaction.reply({
                    embeds: [success("Weekly Claimed", `+${result.amount.toLocaleString()} coins. Balance: **${result.balance.toLocaleString()}**`)],
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "gift": {
                const target = interaction.options.getUser("target");
                const amount = interaction.options.getInteger("amount");
                if (amount <= 0) return interaction.reply({ embeds: [error("Invalid", "Amount must be positive.")], flags: MessageFlags.Ephemeral });
                if (target.id === interaction.user.id) return interaction.reply({ embeds: [error("Invalid", "Cannot gift yourself.")], flags: MessageFlags.Ephemeral });

                const result = await economy.gift(interaction.guild.id, interaction.user.id, target.id, amount);
                if (!result.ok) return interaction.reply({ embeds: [error("Failed", result.error)], flags: MessageFlags.Ephemeral });
                await interaction.reply({
                    embeds: [success("Gifted", `Gave **${amount.toLocaleString()}** coins to <@${target.id}>.`)],
                });
                break;
            }

            case "leaderboard": {
                const list = await economy.getLeaderboard(interaction.guild.id, 10);
                if (!list.length) return interaction.reply({ embeds: [panel("Leaderboard", "No data yet.")] });
                const lines = list.map((e, i) => `\`${i + 1}.\` <@${e.userId}> — **${e.balance.toLocaleString()}** coins`);
                await interaction.reply({ embeds: [panel("Leaderboard", lines.join("\n"))] });
                break;
            }

            case "history": {
                const list = await economy.getHistory(interaction.guild.id, interaction.user.id, 10);
                if (!list.length) return interaction.reply({ embeds: [panel("History", "No transactions yet.")], flags: MessageFlags.Ephemeral });
                const lines = list.map(t => `\`${t.type}\` ${t.amount > 0 ? "+" : ""}${t.amount.toLocaleString()} — bal: ${t.balanceAfter.toLocaleString()} — <t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`);
                await interaction.reply({ embeds: [panel("Transaction History", lines.join("\n"))], flags: MessageFlags.Ephemeral });
                break;
            }
        }
    },
};
