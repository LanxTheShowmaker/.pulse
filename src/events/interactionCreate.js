import { MessageFlags } from "discord.js";
import { logger } from "../core/logger.js";
import { errorPanel } from "../design/containers/panels.js";
import { containerReply, containerFollowUp } from "../design/containers/base.js";

function resolveComponent(client, customId) {
    if (client.components.has(customId))
        return client.components.get(customId);
    for (const [key, handler] of client.components) {
        if (customId === key || customId.startsWith(key + ":"))
            return handler;
    }
    const namespace = customId.split(":")[0];
    if (namespace && client.components.has(namespace)) {
        return client.components.get(namespace);
    }
    return undefined;
}

export default {
    name: "interactionCreate",
    async execute(interaction, client) {
        try {
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command)
                    return;
                await command.execute(interaction);
                return;
            }
            if (interaction.isAutocomplete()) {
                const command = client.commands.get(interaction.commandName);
                if (command?.autocomplete)
                    await command.autocomplete(interaction);
                return;
            }
            if (interaction.isMessageComponent()) {
                const handler = resolveComponent(client, interaction.customId);
                if (handler) {
                    logger.info("interaction", `component ${interaction.customId} by ${interaction.user.tag}`);
                    await handler(interaction);
                } else {
                    logger.warn("interaction", `no handler for ${interaction.customId}`);
                }
                return;
            }
            if (interaction.isModalSubmit()) {
                const handler = resolveComponent(client, interaction.customId);
                if (handler) {
                    logger.info("interaction", `modal ${interaction.customId} by ${interaction.user.tag}`);
                    await handler(interaction);
                } else {
                    logger.warn("interaction", `no modal handler for ${interaction.customId}`);
                }
            }
        }
        catch (e) {
            logger.error("interaction", "unhandled error", e);
            const reply = errorPanel("Something went wrong", "That action could not be completed. Please try again or contact staff.");
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ components: [reply], flags: MessageFlags.Ephemeral }).catch(() => { });
            }
            else {
                await interaction.reply({ components: [reply], flags: MessageFlags.Ephemeral }).catch(() => { });
            }
        }
    },
};
//# sourceMappingURL=interactionCreate.js.map