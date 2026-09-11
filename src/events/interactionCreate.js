import { Events, InteractionType, MessageFlags } from "discord.js";
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

                // Exact match
                if (client.components.has(id)) {
                    await client.components.get(id)(interaction, client);
                    return;
                }

                // Prefix match (e.g. "ticket:close:123" matches "ticket:close:")
                for (const [key, handler] of client.components) {
                    if (key.endsWith(":") && id.startsWith(key)) {
                        await handler(interaction, client);
                        return;
                    }
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
