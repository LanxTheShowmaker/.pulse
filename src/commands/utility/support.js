import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { Theme } from "../../design/theme.js";

export default {
    data: new SlashCommandBuilder().setName("support").setDescription("Get help — tickets, panels, and staff"),
    category: "Utility",
    async execute(interaction) {
        const e = embeds.panel("Support", "*We're here to help — choose your path below.*", [
            { name: "  🛒  Orders", value: "> Open via the **Orders** panel dropdown (configured in `/setuptickets`)", inline: true },
            { name: "  🛟  Assistance", value: "> Open via the **Assistance** panel for help or reports", inline: true },
            { name: "  📜  Regulations", value: "> See the **Regulations** panel for rules", inline: true },
            { name: "  ℹ️  Need a human?", value: "> If panels aren't visible, ask staff or run `/help`", inline: false },
        ]);
        e.setColor(Theme.info);
        e.setThumbnail(interaction.guild?.iconURL({ size:128 }) ?? null);
        await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(()=>{});
    },
};
