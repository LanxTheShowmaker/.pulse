import { SlashCommandBuilder, MessageFlags, time, EmbedBuilder } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";
import { getServerInfo } from "./serverinfo.js";

export default {
    data: new SlashCommandBuilder()
        .setName("info")
        .setDescription("Unified info — user, server, avatar")
        .addSubcommand((s) => s.setName("user").setDescription("Show member info").addUserOption((o) => o.setName("user").setDescription("Member").setRequired(false)))
        .addSubcommand((s) => s.setName("server").setDescription("Show server info"))
        .addSubcommand((s) => s.setName("avatar").setDescription("Show avatar").addUserOption((o) => o.setName("user").setDescription("Member"))),
    category: "Utility",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;
        if (sub === "server") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const e = await getServerInfo(guild);
            return interaction.editReply({ embeds: [e] }).catch(() => {});
        }
        if (sub === "avatar") {
            const user = interaction.options.getUser("user") ?? interaction.user;
            const url = user.displayAvatarURL({ size: 512, forceStatic: false });
            const e = embeds.panel(`✦  ${user.username}`, `*Avatar for **${user.tag}**.*`, [], { author: { name: `Avatar`, iconURL: user.displayAvatarURL() } });
            e.setImage(url);
            e.setColor(Theme.soft);
            const row = interaction.client.services.utility.makeAvatarButton(url);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            return interaction.editReply({ embeds: [e], components: [row] }).catch(() => {});
        }
        // user — now handles self, another user, not cached, left server
        const user = interaction.options.getUser("user") ?? interaction.user;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        // Robust fetch: try guild members, then client users for left/not cached
        let member = await guild.members.fetch(user.id).catch(() => guild.members.cache.get(user.id) || null);
        if(!member){
            // Try fetching user directly to ensure we have latest data (for left users)
            try{ await interaction.client.users.fetch(user.id).catch(()=>null); }catch{}
        }
        const roles = member ? member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).first(10).map((r) => r.name).join(", ") || "—" : "—";
        const e = embeds.panel(`✦  ${user.username}`, `*Member insight for **${user.tag}**.*`, [
            { name: "  ID", value: `\`${user.id}\``, inline: true },
            { name: "  Username", value: `> ${user.username}`, inline: true },
            { name: "  Global", value: `> ${user.globalName ?? "—"}`, inline: true },
            { name: "  Nickname", value: `> ${member?.nickname ?? "—"}`, inline: true },
            { name: "  Joined", value: `> ${member?.joinedAt ? time(member.joinedAt, "R") : "—"}`, inline: true },
            { name: "  Created", value: `> ${time(user.createdAt, "R")}`, inline: true },
            { name: "  Roles", value: `> ${roles}` },
        ], { author: { name: `Member`, iconURL: user.displayAvatarURL() } });
        e.setThumbnail(user.displayAvatarURL({ size: 256 }));
        e.setColor(Theme.info);
        return interaction.editReply({ embeds: [e] }).catch(() => {});
    },
};
