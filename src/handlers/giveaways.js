import { MessageFlags } from "discord.js";
import { EmbedBuilder } from "@discordjs/builders";
import { error, success, info } from "../design/embeds.js";
import { Theme, Brand } from "../design/theme.js";

export default {
    "giveaway:enter:": async (i, client) => {
        const giveawayId = i.customId.split(":")[2];
        if (!giveawayId) return i.reply({ embeds: [errorEmbed("Invalid giveaway")], flags: MessageFlags.Ephemeral }).catch(() => {});

        const g = client.services.giveaways.giveaways[giveawayId];
        if (!g) return i.reply({ embeds: [errorEmbed("Giveaway not found")], flags: MessageFlags.Ephemeral }).catch(() => {});
        if (g.status !== "ACTIVE") return i.reply({ embeds: [errorEmbed("This giveaway has ended")], flags: MessageFlags.Ephemeral }).catch(() => {});

        if (!g.entries) g.entries = [];
        const idx = g.entries.indexOf(i.user.id);

        if (idx >= 0) {
            g.entries.splice(idx, 1);
            g.entryCount = g.entries.length;
            client.services.giveaways.markDirty();
            await i.reply({ embeds: [infoEmbed("Left", `Removed from **${g.prize}**.`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
            g.entries.push(i.user.id);
            g.entryCount = g.entries.length;
            client.services.giveaways.markDirty();
            // Achievement: giveaway entered
            client.services.achievements?.increment(i.guild.id, i.user.id, "giveawaysEntered").catch(() => {});
            await i.reply({ embeds: [successEmbed("Entered", `You're entered to win **${g.prize}**.`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        await client.services.giveaways.refreshMessage(g).catch(() => {});
    },
};

function errorEmbed(msg) { return new EmbedBuilder().setColor(Theme.danger).setDescription(msg).setFooter({ text: Brand.footer }); }
function successEmbed(title, msg) { return new EmbedBuilder().setColor(Theme.success).setTitle(title).setDescription(msg).setFooter({ text: Brand.footer }); }
function infoEmbed(title, msg) { return new EmbedBuilder().setColor(Theme.info).setTitle(title).setDescription(msg).setFooter({ text: Brand.footer }); }
