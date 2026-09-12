import { Events, MessageFlags } from "discord.js";
import { logger } from "../core/logger.js";

export default {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        try {
            // Slash commands
            if (interaction.isChatInputCommand()) {
                const cmd = client.commands.get(interaction.commandName);
                if (!cmd) return;
                await cmd.execute(interaction, client);
                return;
            }

            // Autocomplete
            if (interaction.isAutocomplete()) {
                const cmd = client.commands.get(interaction.commandName);
                if (cmd?.autocomplete) await cmd.autocomplete(interaction, client);
                return;
            }

            // Component interactions (buttons, selects, modals)
            if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
                const id = interaction.customId;

                // 1. Exact match
                if (client.components.has(id)) {
                    await client.components.get(id)(interaction, client);
                    return;
                }

                // 2. Prefix match — longest prefix first to avoid conflicts
                let bestMatch = null;
                let bestLen = 0;
                for (const [key, handler] of client.components) {
                    if (key.endsWith(":") && id.startsWith(key) && key.length > bestLen) {
                        bestMatch = handler;
                        bestLen = key.length;
                    }
                }

                if (bestMatch) {
                    await bestMatch(interaction, client);
                    return;
                }

                logger.warn("interaction", `no handler for component: ${id}`);
            }
        } catch (e) {
            logger.error("interaction", `error handling ${interaction.customId ?? interaction.commandName}`, e);
            const reply = { content: "An error occurred.", flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
            else await interaction.reply(reply).catch(() => {});
        }
    },
};
