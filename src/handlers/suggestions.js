import { MessageFlags } from "discord.js";
import { Theme, Brand } from "../design/theme.js";
import { EmbedBuilder } from "@discordjs/builders";
import { error, success } from "../design/embeds.js";

export default [
    {
        id: "suggest:approve:",
        async execute(i, client) {
            if (!i.member.permissions.has("ManageGuild")) {
                return i.reply({ embeds: [error("Denied", "You need Manage Server permission.")], flags: MessageFlags.Ephemeral });
            }

            const id = i.customId.split(":")[2];
            const note = i.customId.split(":")[3] || null;
            const result = await client.services.suggestions.setStatus(i.guild.id, id, "APPROVED", i.user.id, note);

            if (!result) {
                return i.reply({ embeds: [error("Not Found", "Suggestion not found.")], flags: MessageFlags.Ephemeral });
            }

            await i.reply({ embeds: [success("Approved", `Suggestion \`${id.slice(0, 6)}\` approved.`)], flags: MessageFlags.Ephemeral });
        },
    },
    {
        id: "suggest:deny:",
        async execute(i, client) {
            if (!i.member.permissions.has("ManageGuild")) {
                return i.reply({ embeds: [error("Denied", "You need Manage Server permission.")], flags: MessageFlags.Ephemeral });
            }

            const id = i.customId.split(":")[2];
            const note = i.customId.split(":")[3] || null;
            const result = await client.services.suggestions.setStatus(i.guild.id, id, "DENIED", i.user.id, note);

            if (!result) {
                return i.reply({ embeds: [error("Not Found", "Suggestion not found.")], flags: MessageFlags.Ephemeral });
            }

            await i.reply({ embeds: [success("Denied", `Suggestion \`${id.slice(0, 6)}\` denied.`)], flags: MessageFlags.Ephemeral });
        },
    },
];
