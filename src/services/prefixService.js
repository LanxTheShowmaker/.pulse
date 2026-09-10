import { logger } from "../core/logger.js";

const DEFAULT_PREFIX = "!";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class PrefixService {
    prisma;
    client;
    cache = new Map(); // guildId -> { prefix, expires }
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async getPrefix(guildId) {
        if (!guildId) return DEFAULT_PREFIX;
        const cached = this.cache.get(guildId);
        if (cached && cached.expires > Date.now()) {
            return cached.prefix;
        }
        try {
            const row = await this.prisma.guildConfig.findUnique({ where: { guildId }, select: { prefix: true } });
            const prefix = row?.prefix || DEFAULT_PREFIX;
            this.cache.set(guildId, { prefix, expires: Date.now() + CACHE_TTL });
            return prefix;
        } catch (e) {
            logger.warn("prefix", "getPrefix failed, using default", e.message);
            return DEFAULT_PREFIX;
        }
    }

    async setPrefix(guildId, prefix) {
        // Validate: allow 1-10 chars
        if (typeof prefix !== "string" || prefix.length < 1 || prefix.length > 10) {
            throw new Error("Prefix must be 1-10 characters");
        }
        // Disallow spaces and control chars
        if (/\s/.test(prefix) || /[\x00-\x1F\x7F]/.test(prefix)) {
            throw new Error("Prefix cannot contain spaces or control characters");
        }
        const clean = prefix.trim();
        await this.client.services.settings.patch(guildId, { prefix: clean });
        this.cache.set(guildId, { prefix: clean, expires: Date.now() + CACHE_TTL });
        return clean;
    }

    async resetPrefix(guildId) {
        return this.setPrefix(guildId, DEFAULT_PREFIX);
    }

    invalidate(guildId) {
        this.cache.delete(guildId);
    }

    // Robust parser supporting quoted arguments: "some arg with spaces"
    parseArgs(content) {
        const args = [];
        let current = "";
        let inQuote = false;
        let quoteChar = null;
        let escaping = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            if (escaping) {
                current += char;
                escaping = false;
                continue;
            }
            if (char === "\\" && inQuote) {
                escaping = true;
                continue;
            }
            if ((char === '"' || char === "'") && !inQuote) {
                inQuote = true;
                quoteChar = char;
                continue;
            }
            if (char === quoteChar && inQuote) {
                inQuote = false;
                quoteChar = null;
                continue;
            }
            if (char === " " && !inQuote) {
                if (current.length > 0) {
                    args.push(current);
                    current = "";
                }
                continue;
            }
            current += char;
        }
        if (current.length > 0) args.push(current);
        return args;
    }

    // Resolve mention to ID
    extractId(mention) {
        if (!mention) return null;
        // <@123>, <@!123>, <@&123>, <#123>
        const m = mention.match(/^<[@#&!]*(\d+)>$/);
        if (m) return m[1];
        // Raw ID
        if (/^\d{17,20}$/.test(mention)) return mention;
        return null;
    }

    async handleMessage(message) {
        if (message.author.bot || message.system) return false;
        const guildId = message.guildId;
        // Handle DMs: use default prefix, but only allow non-guild-specific commands
        const isDM = !message.guild;
        const prefix = await this.getPrefix(guildId);
        const content = message.content.trim();

        // Check if message starts with prefix (support both prefix+command and prefix + command)
        let withoutPrefix = null;
        if (content.startsWith(prefix)) {
            withoutPrefix = content.slice(prefix.length).trim();
            // Handle case where prefix is e.g. "!" and message is "!ping" -> withoutPrefix = "ping"
            // Also handle "! ping" -> withoutPrefix = "ping" after trim
            if (withoutPrefix.length === 0) return false;
        } else {
            return false;
        }

        // Parse command and args, respecting quotes
        const parsed = this.parseArgs(withoutPrefix);
        if (parsed.length === 0) return false;

        let cmdName = parsed[0].toLowerCase();
        // Resolve alias first (centralized)
        const { resolveAlias } = await import("../core/aliases.js");
        const originalName = cmdName;
        cmdName = resolveAlias(cmdName);
        if(originalName !== cmdName){
            // Alias resolved, keep args as is (alias preserves subcommand handling)
        }
        let args = parsed.slice(1);

        // Handle subcommand: e.g., "ticket close" -> cmdName="ticket", subcommand="close"
        // Fixed: use toJSON().options and handle case insensitively, support multiple subcommand levels
        let subcommand = null;
        let slashCmd = this.client.commands.get(cmdName);
        // If alias resolved to a command that doesn't exist as slash, try original
        if(!slashCmd) slashCmd = this.client.commands.get(originalName);
        if (slashCmd) {
            try{
                const jsonOpts = slashCmd.data.toJSON().options || [];
                // Check for subcommands (type 1) or subcommand groups (type 2)
                const hasSubcommands = jsonOpts.some(o => o.type === 1 || o.type === 2);
                if (hasSubcommands && args.length > 0) {
                    const maybeSub = args[0].toLowerCase();
                    // Check direct subcommand
                    let found=false;
                    for(const opt of jsonOpts){
                        if(opt.type === 1 && opt.name.toLowerCase() === maybeSub){
                            found=true; break;
                        }
                        if(opt.type === 2){ // group
                            // For prefix, we support "group sub" as two args
                            if(opt.options?.some(o=> o.type===1 && o.name.toLowerCase()===maybeSub)){
                                found=true; break;
                            }
                            // Also check second arg if first is group
                            if(args.length>1){
                                const maybeSub2=args[1].toLowerCase();
                                if(opt.name.toLowerCase()===maybeSub && opt.options?.some(o=> o.type===1 && o.name.toLowerCase()===maybeSub2)){
                                    // Handle group + sub
                                    subcommand = maybeSub; // group
                                    // For now, treat as subcommand = group, and keep second as part of args for mock
                                    // But our simple handler expects single subcommand, so we handle group separately
                                    found=true; break;
                                }
                            }
                        }
                    }
                    if (found) {
                        subcommand = maybeSub;
                        args = args.slice(1);
                    } else {
                        // Check if command actually requires a subcommand but none provided - will be handled later
                        // For now, don't set subcommand, let executeWithMock handle missing subcommand error
                    }
                }
            }catch(e){ logger.warn("prefix","subcommand detection failed", e.message); }
        }

        // Resolve command (with alias)
        let command = this.client.commands.get(cmdName);
        if (!command) command = this.client.commands.get(originalName);
        if (!command) {
            // Unknown command - ignore to avoid spam, but could optionally hint
            return false;
        }

        // Handle DMs: reject guild-only commands (isDM already defined above)
        if (isDM) {
            const guildOnlyCategories = ["Moderation", "Config", "Tickets", "Orders"];
            if (guildOnlyCategories.includes(command.category)) {
                await message.reply({ content: "This command can only be used in a server. Use it in a guild.", allowedMentions: { repliedUser: false } }).catch(() => {});
                return true;
            }
            // For DM, we still allow utility/economy etc. with default prefix
        }

        // Check permissions, cooldowns, etc. - delegate to command's execute but with mock interaction
        // Instead, we will directly handle prefix via a dedicated prefix handler map to share logic
        // For now, try to execute via prefix handler if exists, otherwise fallback to slash mock
        try {
            // If command has a prefixExecute, use it
            if (typeof command.prefixExecute === "function") {
                await command.prefixExecute(message, args, subcommand, prefix);
                return true;
            }

            // Generic fallback: create mock interaction for simple commands
            // This handles cases where command expects interaction.options but we can simulate
            // For complex commands, we need specific handling — delegate to prefixService's command map
            const handled = await this.executeWithMock(message, command, args, subcommand, prefix);
            return handled;
        } catch (e) {
            logger.error("prefix", `Failed to execute ${cmdName}`, e);
            try {
                await message.reply({ content: `Error executing \`${prefix}${cmdName}\`: ${e.message.slice(0,300)}`, allowedMentions: { repliedUser: false } });
            } catch {}
            return true;
        }
    }

    async executeWithMock(message, command, args, subcommand, prefix) {
        // Build a mock interaction that mimics the slash command's expected structure
        // This is a best-effort for simple commands; complex ones should have prefixExecute
        const guild = message.guild;
        const member = message.member;
        const user = message.author;
        const isDM = !guild;

        // Create a mock options object that provides getUser, getString, getInteger, etc.
        // We parse args positionally based on command's data.options
        const data = command.data.toJSON();
        let options = data.options || [];
        
        // If subcommand, drill into subcommand's options
        let targetOptions = options;
        let actualSubcommand = subcommand;
        if (subcommand) {
            const sub = options.find(o => o.type === 1 && o.name === subcommand);
            if (sub) targetOptions = sub.options || [];
            else actualSubcommand = null;
        } else if (options.length > 0 && options[0].type === 1) {
            // Command requires subcommand but none provided
            const available = options.map(o => o.name).join(", ");
            await message.reply({ content: `Missing subcommand for \`${prefix}${data.name}\`. Available: ${available}`, allowedMentions: { repliedUser: false } });
            return true;
        }

        // Map args to options by position and type
        const mockOptions = {
            getSubcommand: () => actualSubcommand,
            getString: (name, required = false) => {
                const opt = targetOptions.find(o => o.name === name);
                if (!opt) return required ? null : null;
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (raw === undefined && required) throw new Error(`Missing required string option "${name}"`);
                return raw || null;
            },
            getUser: (name, required = false) => {
                const opt = targetOptions.find(o => o.name === name);
                if (!opt) return null;
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (!raw && required) throw new Error(`Missing required user option "${name}"`);
                if (!raw) return null;
                // Try to resolve mention or ID
                const id = this.extractId(raw) || raw;
                // Try to find in guild cache, otherwise in mentions, otherwise fetch
                let found = null;
                if (guild) {
                    found = guild.members.cache.get(id) || message.mentions.members?.get(id) || message.mentions.users?.get(id);
                } else {
                    found = message.mentions.users?.get(id) || null;
                }
                if (found) {
                    // If it's a GuildMember, return user
                    return found.user || found;
                }
                // Try to get user from client cache
                let user = this.client.users.cache.get(id);
                if (user) return user;
                // Fallback: create a mock user object with id only (will be fetched in command)
                return { id, tag: `Unknown#0000`, username: "Unknown", displayAvatarURL: () => null, createdAt: new Date(0) };
            },
            getMember: (name) => {
                if (!guild) return null;
                const id = mockOptions.getUser(name)?.id;
                if (!id) return null;
                return guild.members.cache.get(id) || null;
            },
            getChannel: (name) => {
                if (!guild) return null;
                const opt = targetOptions.find(o => o.name === name);
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (!raw) return null;
                const id = this.extractId(raw);
                return guild.channels.cache.get(id) || message.mentions.channels?.get(id) || null;
            },
            getRole: (name) => {
                if (!guild) return null;
                const opt = targetOptions.find(o => o.name === name);
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (!raw) return null;
                const id = this.extractId(raw);
                return guild.roles.cache.get(id) || message.mentions.roles?.get(id) || null;
            },
            getInteger: (name, required = false) => {
                const opt = targetOptions.find(o => o.name === name);
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (raw === undefined && required) throw new Error(`Missing required integer option "${name}"`);
                if (raw === undefined) return null;
                const num = parseInt(raw, 10);
                if (isNaN(num) && required) throw new Error(`Invalid integer for "${name}": ${raw}`);
                return isNaN(num) ? null : num;
            },
            getNumber: (name, required = false) => {
                const opt = targetOptions.find(o => o.name === name);
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (raw === undefined && required) throw new Error(`Missing required number option "${name}"`);
                if (raw === undefined) return null;
                const num = parseFloat(raw);
                return isNaN(num) ? null : num;
            },
            getBoolean: (name) => {
                const opt = targetOptions.find(o => o.name === name);
                const idx = targetOptions.indexOf(opt);
                const raw = args[idx];
                if (raw === undefined) return null;
                return raw.toLowerCase() === "true" || raw === "1";
            },
            getAttachment: (name) => {
                // For prefix, attachments come from message.attachments
                return message.attachments.first() || null;
            }
        };

        // Create mock interaction
        const mockInteraction = {
            guild,
            guildId: guild?.id || null,
            channel: message.channel,
            channelId: message.channel.id,
            member,
            user,
            client: this.client,
            options: mockOptions,
            deferReply: async () => {},
            reply: async (opts) => {
                // Convert embed or content to message
                if (opts.embeds) {
                    return message.reply({ embeds: opts.embeds, components: opts.components, allowedMentions: { repliedUser: false } });
                }
                return message.reply({ content: opts.content || opts.embeds?.[0]?.description || "Done", allowedMentions: { repliedUser: false } });
            },
            editReply: async (opts) => {
                return message.reply({ embeds: opts.embeds, components: opts.components, content: opts.content, allowedMentions: { repliedUser: false } });
            },
            followUp: async (opts) => {
                return message.channel.send({ embeds: opts.embeds, components: opts.components, content: opts.content, allowedMentions: { repliedUser: false } });
            },
            deferUpdate: async () => {},
            update: async () => {},
            showModal: async () => {
                await message.reply({ content: "This command requires a modal and cannot be used via prefix. Please use slash command `/" + data.name + "`", allowedMentions: { repliedUser: false } });
                throw new Error("Modal not supported via prefix");
            },
            fetchReply: async () => message,
            replied: false,
            deferred: false,
            createdAt: new Date(),
            // For audit logging
            isChatInputCommand: () => true,
        };

        // Add helper to get option with required flag handling
        // Monkey-patch to support getString("name", true) etc. already handled

        try {
            await command.execute(mockInteraction);
            return true;
        } catch (e) {
            // If the command failed due to mock limitations, try to provide helpful error
            if (e.message.includes("Modal not supported")) return true;
            throw e;
        }
    }
}
