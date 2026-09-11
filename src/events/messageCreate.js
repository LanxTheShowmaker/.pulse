import { Events } from "discord.js";
import { logger } from "../core/logger.js";

const PREFIX_COMMANDS = {
    ping: "ping",
    help: "help",
    afk: "afk",
    level: "level",
    lb: "leaderboard",
    leaderboard: "leaderboard",
    bal: "economy",
    balance: "economy",
    daily: "economy",
    suggest: "suggest",
    rps: "rps",
    flip: "coinflip",
    coinflip: "coinflip",
    roll: "roll",
    "8ball": "8ball",
    joke: "joke",
    meme: "meme",
    ship: "ship",
    trivia: "trivia",
    staff: "staff",
    bot: "bot",
    invite: "bot",
};

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // AutoMod
        try {
            await client.services.automod.handleMessage(message);
        } catch (e) {
            logger.error("events", "automod failed", e.message);
        }

        // Leveling
        try {
            await client.services.leveling.handleMessage(message);
        } catch (e) {
            logger.error("events", "leveling failed", e.message);
        }

        // AFK
        try {
            await client.services.afk.handleMessage(message);
        } catch (e) {
            logger.error("events", "afk failed", e.message);
        }

        // Prefix commands
        try {
            const config = await client.services.settings.get(message.guild.id);
            const prefix = config.prefix || "!";
            if (!message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/\s+/);
            const cmd = args.shift()?.toLowerCase();
            if (!cmd) return;

            const commandName = PREFIX_COMMANDS[cmd];
            if (!commandName) return;

            const command = client.commands.get(commandName);
            if (!command) return;

            // Create a mock interaction-like object for prefix commands
            const mockInteraction = {
                guild: message.guild,
                channel: message.channel,
                member: message.member,
                user: message.author,
                client: client,
                options: {
                    getSubcommand: () => null,
                    getString: (name) => {
                        const idx = args.indexOf(name);
                        return idx >= 0 ? args[idx + 1] : null;
                    },
                    getUser: (name) => null,
                    getChannel: (name) => null,
                    getRole: (name) => null,
                    getInteger: (name) => null,
                    getBoolean: (name) => null,
                },
                reply: (opts) => message.reply(typeof opts === "string" ? { content: opts } : opts),
                deferReply: () => Promise.resolve(),
                editReply: (opts) => message.edit(typeof opts === "string" ? { content: opts } : opts),
                followUp: (opts) => message.reply(typeof opts === "string" ? { content: opts } : opts),
                replied: false,
                deferred: false,
                isChatInputCommand: () => true,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
                isModalSubmit: () => false,
                commandName: commandName,
                customId: null,
            };

            await command.execute(mockInteraction, client);
        } catch (e) {
            logger.error("events", "prefix command failed", e.message);
        }
    },
};
