import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("trade").setDescription("Trade coins (simple)").addSubcommand(s=> s.setName("offer").setDescription("Offer trade").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("amount").setDescription("Amount").setRequired(true))).addSubcommand(s=> s.setName("accept").setDescription("Accept")).addSubcommand(s=> s.setName("cancel").setDescription("Cancel")),
    category:"Economy",
    async execute(interaction){
        return interaction.reply({ embeds:[embeds.info("Trade","Use /pay or /economy gift to transfer coins.")] , flags: MessageFlags.Ephemeral});
    }
};