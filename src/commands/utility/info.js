import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord.js";
import { panel } from "../../design/embeds.js";

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
            const embed = panel(user.tag, "")
                .addFields(
                    { name: "ID", value: user.id, inline: true },
                    { name: "Created", value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true },
                )
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            if (member) {
                embed.addFields({ name: "Joined", value: `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`, inline: true });
                if (member.roles.cache.size > 1) {
                    embed.addFields({ name: "Roles", value: member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(", ").slice(0, 1024) || "None" });
                }
            }
            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "server") {
            const g = interaction.guild;
            const embed = panel(g.name, "")
                .addFields(
                    { name: "ID", value: g.id, inline: true },
                    { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
                    { name: "Members", value: `${g.memberCount}`, inline: true },
                    { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
                    { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
                    { name: "Created", value: `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>`, inline: true },
                );
            if (g.iconURL()) embed.setThumbnail(g.iconURL({ size: 256 }));
            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "avatar") {
            const user = interaction.options.getUser("target") ?? interaction.user;
            const url = user.displayAvatarURL({ size: 512 });
            await interaction.reply({
                embeds: [panel(`${user.tag}'s Avatar`, `[Download](${url})`).setThumbnail(url)],
            });
        }
    },
};
