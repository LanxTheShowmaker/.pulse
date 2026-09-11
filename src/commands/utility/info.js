import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel, profile, stat } from "../../design/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("info")
        .setDescription("Information commands")
        .addSubcommand(sub => sub.setName("user").setDescription("User info")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(false)))
        .addSubcommand(sub => sub.setName("server").setDescription("Server info"))
        .addSubcommand(sub => sub.setName("avatar").setDescription("User avatar")
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(false))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === "user") {
            const user = interaction.options.getUser("target") ?? interaction.user;
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            const embed = profile(user, "");

            embed.addFields(
                stat("ID", user.id),
                stat("Created", `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`),
            );

            if (member) {
                embed.addFields(stat("Joined", `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`));
                const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id);
                if (roles.size > 0) {
                    embed.addFields({ name: `Roles (${roles.size})`, value: roles.map(r => `<@&${r.id}>`).join(", ").slice(0, 1024) });
                }
            }

            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "server") {
            const g = interaction.guild;
            const online = g.members.cache.filter(m => m.presence?.status !== "offline").size;
            const embed = panel(g.name, "")
                .addFields(
                    stat("Owner", `<@${g.ownerId}>`),
                    stat("Created", `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`),
                    stat("Verification", g.verificationLevel.toString()),
                    stat("Members", `${g.memberCount} (${online} online)`),
                    stat("Channels", `${g.channels.cache.size}`),
                    stat("Roles", `${g.roles.cache.size}`),
                    stat("Emojis", `${g.emojis.cache.size}`),
                    stat("Boosts", `${g.premiumSubscriptionCount ?? 0}`),
                );
            if (g.iconURL()) embed.setThumbnail(g.iconURL({ size: 256 }));
            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "avatar") {
            const user = interaction.options.getUser("target") ?? interaction.user;
            const url = user.displayAvatarURL({ size: 512 });
            const embed = panel(`${user.tag}'s Avatar`, `[Download](${url})`).setImage(url);
            await interaction.reply({ embeds: [embed] });
        }
    },
};
