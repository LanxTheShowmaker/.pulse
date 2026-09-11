import { ActionRowBuilder, ButtonBuilder, SelectMenuBuilder, ModalBuilder, TextInputBuilder, EmbedBuilder } from "@discordjs/builders";
import { ChannelType, PermissionFlagsBits, MessageFlags, UserSelectMenuComponent, ButtonStyle, TextInputStyle } from "discord.js";
import { embeds, confirmationRow } from "../design/embeds.js";
import { logger } from "../core/logger.js";
import { Theme, Brand } from "../design/theme.js";
import { isStaff } from "../core/services.js";

const STATUS = {
    OPEN: "OPEN",
    CLAIMED: "CLAIMED",
    WAITING: "WAITING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CLOSED: "CLOSED",
};
const PRIORITY = {
    LOW: "LOW",
    NORMAL: "NORMAL",
    HIGH: "HIGH",
    URGENT: "URGENT",
};

export class TicketSystemService {
    prisma;
    client;
    settings;
    logging;
    cooldowns = new Map(); // `${guildId}:${userId}:${typeKey}` -> timestamp
    constructor(prisma, client, settings, logging) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
        this.logging = logging;
        this.registerHandlers();
        // Auto-deletion: archived tickets are deleted after delay, survives restart via DB polling
        this._deleteInterval = setInterval(() => this.checkDeletions().catch((e) => logger.error("tickets", "autodelete failed", e)), 60_000);
        if (this._deleteInterval.unref) this._deleteInterval.unref();
        // Initial check 30s after startup (after client ready and guilds cached)
        this._startupTimeout = setTimeout(() => this.checkDeletions().catch(()=>{}), 30_000);
        if (this._startupTimeout.unref) this._startupTimeout.unref();
    }
    shutdown() {
        if (this._deleteInterval) clearInterval(this._deleteInterval);
        if (this._startupTimeout) clearTimeout(this._startupTimeout);
    }
    getDeletionDelayMs(guildId){
        // Configurable via GuildConfig.orders.deletionDelayMs or Panel config; default 10 minutes
        try{
            // Try to read from settings cache synchronously? For now return default, but allow async override
            // This is called from checkDeletions which is async, so we could fetch config there
            return 10 * 60 * 1000;
        }catch{ return 10 * 60 * 1000; }
    }
    async getDeletionDelayMsAsync(guildId){
        try{
            const cfg=await this.settings.get(guildId).catch(()=>null);
            const orders=cfg?.orders || {};
            if(typeof orders.deletionDelayMs==="number" && orders.deletionDelayMs>=60_000 && orders.deletionDelayMs<=7*24*3600*1000) return orders.deletionDelayMs;
            // Also check panel config for archive delay
            const panel=await this.prisma.panel.findUnique({ where:{ guildId_panelType:{ guildId, panelType:"ORDER" }}}).catch(()=>null);
            if(panel){
                try{
                    const pc=JSON.parse(panel.config||"{}");
                    if(typeof pc.deletionDelayMs==="number") return pc.deletionDelayMs;
                }catch{}
            }
        }catch{}
        return 10 * 60 * 1000;
    }

    registerHandlers() {
        const c = this.client.components;
        // Panel dropdown
        c.set("panel:select", async (i) => this.handlePanelSelect(i));
        c.set("panel:dashboard", async (i) => this.handleDashboardSelect(i));
        // Ticket modals
        c.set("ticket:questions", async (i) => this.handleQuestionModal(i));
        // Ticket controls
        c.set("ticket:claim", async (i) => this.handleClaim(i));
        c.set("ticket:unclaim", async (i) => this.handleUnclaim(i));
        c.set("ticket:status", async (i) => this.handleStatusSelect(i));
        c.set("ticket:priority", async (i) => this.handlePrioritySelect(i));
        c.set("ticket:add", async (i) => this.handleAddUser(i));
        c.set("ticket:remove", async (i) => this.handleRemoveUser(i));
        c.set("ticket:info", async (i) => this.handleInfo(i));
        c.set("ticket:close", async (i) => this.handleClose(i));
        c.set("ticket:transcript", async (i) => this.handleTranscript(i));
    }

    sanitizeName(name) {
        let s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!s) s = "user";
        return s.slice(0, 12);
    }
    async uniqueChannelName(guild, categoryKey, userName, shortId, prefix) {
        // Channel name: [category][user][id] => category-user-id (Discord safe)
        const cat = String(categoryKey||prefix||"ticket").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,15);
        const user = this.sanitizeName(userName);
        const id = String(shortId).toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,6) || Math.random().toString(36).slice(2,6);
        const fullBase = `${cat}-${user}-${id}`.replace(/[^a-z0-9-]/g, "-").replace(/-+/g,"-").slice(0,90);
        let name = fullBase;
        let n = 1;
        while (guild.channels.cache.some((c) => c.name === name)) {
            name = `${fullBase}-${n}`.slice(0, 100);
            n++;
        }
        return name;
    }
    // Legacy wrapper for older callers
    async legacyChannelName(guild, base, prefix){
        return this.uniqueChannelName(guild, prefix, base, Math.random().toString(36).slice(2,4), prefix);
    }

    async findCategory(guild, type) {
        if (type?.categoryId) {
            const cat = guild.channels.cache.get(type.categoryId) ?? await guild.channels.fetch(type.categoryId).catch(() => null);
            if (cat && cat.type === ChannelType.GuildCategory) return cat;
        }
        // Discovery
        const candidates = type?.panelType === "ORDER" ? ["orders", "design-orders", "tickets"] : ["support", "assistance", "tickets"];
        for (const cand of candidates) for (const ch of guild.channels.cache.values()) if (ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === cand) return ch;
        return null;
    }

    async buildOverwrites(guild, openerId, type) {
        const cfg = await this.client?.services?.settings.get(guild.id).catch(() => null);
        const staffIds = (() => { try { return JSON.parse(type.staffRoleIds ?? "[]"); } catch { return []; } })();
        const modIds = (() => { try { return JSON.parse(type.moderatorRoleIds ?? "[]"); } catch { return []; } })();
        // Fallback to global staff/mod if type has none
        const globalStaff = cfg?.staffRoleIds ?? [];
        const effectiveStaff = staffIds.length ? staffIds : globalStaff;
        const effectiveMod = modIds.length ? modIds : cfg?.moderatorRoleIds ?? [];
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: openerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
        ];
        for (const id of [...new Set([...effectiveStaff, ...effectiveMod])]) overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
        return overwrites;
    }

    // Anti-duplicate + cooldowns — allow multiple tickets per user up to limits
    async canOpen(guild, userId, type) {
        const cfg = await this.prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key: type.key } } }).catch(()=>null) ?? type;
        // Default max 3 open tickets if not set, and respect per-type maxOpen
        const maxOpen = cfg.maxOpen ?? 3;
        const open = await this.prisma.ticket.count({ where: { guildId: guild.id, openerId: userId, status: { not: STATUS.CLOSED } } }).catch(()=>0);
        if (open >= maxOpen) return { ok: false, reason: `You have ${open} open ticket(s) (max ${maxOpen}). Close one before opening another.` };
        // Per-type cooldown
        if (cfg.cooldown > 0) {
            const key = `${guild.id}:${userId}:${cfg.key}`;
            const last = this.cooldowns.get(key) ?? 0;
            const now = Date.now();
            if (now - last < cfg.cooldown * 1000) {
                const remain = Math.ceil((cfg.cooldown * 1000 - (now - last)) / 1000);
                return { ok: false, reason: `Cooldown: wait ${remain}s before opening another ${cfg.displayName} ticket.` };
            }
            this.cooldowns.delete(key);
        }
        // Allow multiple same-type tickets up to per-type limit (if configured).
        // Only block if per-type count >= 2 and maxOpen is still 1 (legacy) — now allow.
        const sameTypeCount = await this.prisma.ticket.count({ where: { guildId: guild.id, openerId: userId, typeId: cfg.id, status: { not: STATUS.CLOSED } } }).catch(()=>0);
        const perTypeLimit = cfg.maxOpen ?? 3;
        // If user already has 2 of same type and perTypeLimit is 1, would have been blocked earlier by total open check; we allow up to perTypeLimit
        if (sameTypeCount >= perTypeLimit) {
            return { ok: false, reason: `You have ${sameTypeCount} open ${cfg.displayName} tickets (max ${perTypeLimit} per type).` };
        }
        return { ok: true };
    }

    async handlePanelSelect(interaction) {
        if (!interaction.isStringSelectMenu()) return;
        const panelType = interaction.customId.split(":")[2]; // panel:select:ORDER
        const key = interaction.values[0];
        const guild = interaction.guild;
        const member = interaction.member;

        // Access control: blacklist / role restrictions
        const cfg = await this.client?.services?.settings.get(guild.id).catch(()=>null);
        if (cfg?.ignoredUserIds?.includes(member.id)) {
            return interaction.reply({ embeds: [embeds.error("Access denied", "You are not allowed to open tickets.")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }

        let type = await this.prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } }).catch(()=>null);
        // Fallback: if DB has no types yet, auto-create from panel defaults (so dropdown always works)
        if (!type) {
            const fallbacks = this.client?.services?.panels ? this.client?.services?.panels.getFallbackTicketTypes(panelType) : [];
            const fb = fallbacks.find((f)=>f.key===key);
            if (fb) {
                try {
                    type = await this.prisma.ticketType.create({ data:{ guildId:guild.id, panelType, key: fb.key, displayName: fb.displayName, description: fb.description, emoji: fb.emoji, enabled:true, channelPrefix: fb.key.slice(0,10) } });
                } catch (e) {
                    // Race: try fetch again
                    type = await this.prisma.ticketType.findUnique({ where:{ guildId_key:{ guildId:guild.id, key } } }).catch(()=>null);
                }
            }
        }
        if (!type || !type.enabled) return interaction.reply({ embeds: [embeds.error("Not found", "This ticket type is not available.")], flags: MessageFlags.Ephemeral }).catch(()=>{});

        const can = await this.canOpen(guild, member.id, type);
        if (!can.ok) return interaction.reply({ embeds: [embeds.warn("Cannot open ticket", can.reason)], flags: MessageFlags.Ephemeral }).catch(()=>{});

        // Check questions
        let questions = [];
        try { questions = JSON.parse(type.questions ?? "[]"); } catch {}
        if (questions.length) {
            // Build modal
            const modal = new ModalBuilder().setCustomId(`ticket:questions:${type.key}`).setTitle(type.displayName.slice(0,45));
            for (let idx = 0; idx < Math.min(questions.length, 5); idx++) {
                const q = questions[idx];
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`q${idx}`).setLabel(String(q.label ?? q.question ?? `Question ${idx+1}`).slice(0,45)).setStyle(q.style==="PARAGRAPH"? TextInputStyle.Paragraph: TextInputStyle.Short).setRequired(q.required!==false).setMaxLength(1000).setPlaceholder((q.placeholder??"").slice(0,100))));
            }
            return interaction.showModal(modal).catch(()=>{});
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ticket = await this.createTicket(guild, member, type, []);
        await interaction.editReply({ embeds: [embeds.success("Ticket created", `Your ticket is ready: <#${ticket.channelId}>`)] }).catch(()=>{});
    }

    async handleDashboardSelect(i) {
        if (!i.isStringSelectMenu()) return;
        const val = i.values[0];
        const guild = i.guild;
        // Simple info responses
        const map = {
            about: "Each server configures its own content via /config.",
            services: "Use the Orders and Assistance panels to open tickets.",
            staff: "Staff listed via server roles — configure via /config.",
            links: "Invite .pulse: https://discord.com/oauth2/authorize?client_id=" + (process.env.CLIENT_ID ?? "") + "&scope=bot%20applications.commands",
            regulations: "See the Regulations panel for server rules.",
        };
        const text = map[val] ?? "More information coming soon.";
        await i.reply({ embeds: [embeds.info(val, text)], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    async handleQuestionModal(interaction) {
        if (!interaction.isModalSubmit()) return;
        const key = interaction.customId.split(":")[2];
        const guild = interaction.guild;
        const member = interaction.member;
        const type = await this.prisma.ticketType.findUnique({ where: { guildId_key: { guildId: guild.id, key } } }).catch(()=>null);
        if (!type) return interaction.reply({ embeds: [embeds.error("Not found","Type missing")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        let questions = []; try{ questions = JSON.parse(type.questions ?? "[]"); }catch{}
        const answers = [];
        for (let idx=0; idx<Math.min(questions.length,5); idx++) {
            const q = questions[idx];
            const ans = interaction.fields.getTextInputValue(`q${idx}`) ?? "";
            answers.push({ question: q.label ?? q.question ?? `Q${idx+1}`, answer: ans });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ticket = await this.createTicket(guild, member, type, answers);
        await interaction.editReply({ embeds: [embeds.success("Ticket created", `Your ticket: <#${ticket.channelId}>`)] }).catch(()=>{});
    }

    async createTicket(guild, member, type, answers) {
        const prefix = type.channelPrefix ?? "ticket";
        // Channel name: [category][user][id] => e.g., uniform-ultim-a1b2 , order-ultim-8f3c
        const shortId = Math.random().toString(36).slice(2,6).toLowerCase();
        const categoryKey = type.key || type.panelType || prefix;
        const name = await this.uniqueChannelName(guild, categoryKey, member.user.username, shortId, prefix);
        const category = await this.findCategory(guild, type);
        const overwrites = await this.buildOverwrites(guild, member.id, type);
        const channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: category?.id ?? null, permissionOverwrites: overwrites, topic: `Ticket ${type.displayName} • ${member.user.tag}` });

        const status = STATUS.OPEN;
        const ticket = await this.prisma.ticket.create({ data: { guildId: guild.id, channelId: channel.id, openerId: member.id, typeId: type.id, panelType: type.panelType, status, priority: type.priority ?? PRIORITY.NORMAL } });

        // Cooldown set
        if (type.cooldown) this.cooldowns.set(`${guild.id}:${member.id}:${type.key}`, Date.now());

        // Welcome embed matches panel image: banner, ticket title, terms, information
        const branding = await this.client?.services?.branding?.get(guild.id).catch(() => null);
        const display = await this.client?.services?.branding?.getDisplay(guild).catch(() => ({ name: ".pulse", icon: null }));
        // Resolve banner: branding banner > type banner > panel banner > fallback ORDER-HERE dark
        let bannerUrl = branding?.bannerUrl || type.bannerUrl || null;
        if(!bannerUrl){
            try{
                const panel=await this.prisma.panel.findUnique({ where:{ guildId_panelType:{ guildId: guild.id, panelType: type.panelType }}}).catch(()=>null);
                bannerUrl=panel?.bannerUrl || null;
            }catch{}
        }
        // Build new embed to match image: dark, clean, Terms + Information
        const welcome = new EmbedBuilder().setColor(0x2B2D31) // Discord dark to match image
            .setTitle(`${type.displayName} Ticket`)
            .setDescription(`<@${member.id}> — answer the questions below so staff can assist.`);
        if (bannerUrl) welcome.setImage(bannerUrl);
        // Terms of Service field (from image)
        const termsText = type.instructions ? type.instructions.slice(0, 1024) : `By placing an order you agree to the full Terms & Conditions.\nAll orders are strictly **non-refundable** unless a member of the Executive Board decides otherwise.`;
        welcome.addFields({ name: "Terms of Service", value: termsText, inline: false });
        // Information field — per category
        let infoValue;
        if (answers.length) {
            infoValue = answers.map(a => `• **${a.question}**: ${a.answer.slice(0, 200)}`).join("\n");
            if (infoValue.length > 1024) infoValue = infoValue.slice(0, 1021) + "…";
        } else if (type.panelType === "ORDER") {
            infoValue = "Please provide to your designer:\n• References (image form)\n• Quantity\n• Budget";
        } else {
            infoValue = "Please provide:\n• Detailed description of your request\n• Any relevant images or links\n• Desired timeline";
        }
        welcome.addFields({ name: "Information", value: infoValue, inline: false });
        // Footer with branding per-server
        welcome.setFooter({ text: `${display.name} • ${member.user.tag}`, iconURL: display.icon || guild.iconURL() || undefined });
        welcome.setTimestamp();
        // Thumbnail as user avatar subtle (like image has no thumbnail, but keep for context)
        // Do not set thumbnail to keep clean like image — banner is enough
        welcome.setThumbnail(null);

        // Unclaim hidden until claimed — show Claim when unclaimed, Unclaim when claimed
        const rows = this.buildTicketRows(channel.id, ticket);
        await channel.send({ content: `<@${member.id}>`, embeds: [welcome], components: rows }).catch(()=>{});

        // Logging
        try {
            const logCh = await this.client?.services?.logging.channel(guild, "mod");
            if (logCh) await logCh.send({ embeds: [embeds.moderation("Ticket created", `${type.displayName} by <@${member.id}>`, [{name:"Channel", value:`<#${channel.id}>`, inline:true}])] }).catch(()=>{});
        } catch {}

        // Auto-close timer if configured (e.g., type has cooldown? We'll use config stored in Panel? For now check TicketType config JSON)
        return ticket;
    }

    buildTicketRows(channelId, ticket) {
        const isClaimed = !!ticket?.claimedById;
        const row1 = new ActionRowBuilder().addComponents(
            isClaimed
                ? new ButtonBuilder().setCustomId(`ticket:unclaim:${channelId}`).setLabel("Unclaim").setStyle(ButtonStyle.Secondary)
                : new ButtonBuilder().setCustomId(`ticket:claim:${channelId}`).setLabel("Claim").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ticket:close:${channelId}`).setLabel("Close").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ticket:info:${channelId}`).setLabel("Info").setStyle(ButtonStyle.Secondary),
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket:add:${channelId}`).setLabel("Add User").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ticket:remove:${channelId}`).setLabel("Remove").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`ticket:transcript:${channelId}`).setLabel("Transcript").setStyle(ButtonStyle.Secondary),
        );
        const priorityMenu = new SelectMenuBuilder().setCustomId(`ticket:priority:${channelId}`).setPlaceholder("Priority").addOptions([
            { label:"Low", value: PRIORITY.LOW },
            { label:"Normal", value: PRIORITY.NORMAL },
            { label:"High", value: PRIORITY.HIGH },
            { label:"Urgent", value: PRIORITY.URGENT },
        ]);
        const statusMenu = new SelectMenuBuilder().setCustomId(`ticket:status:${channelId}`).setPlaceholder("Status").addOptions([
            { label:"Open", value: STATUS.OPEN },
            { label:"Claimed", value: STATUS.CLAIMED },
            { label:"Waiting", value: STATUS.WAITING },
            { label:"In Progress", value: STATUS.IN_PROGRESS },
            { label:"Completed", value: STATUS.COMPLETED },
            { label:"Closed", value: STATUS.CLOSED },
        ]);
        return [row1, row2, new ActionRowBuilder().addComponents(priorityMenu), new ActionRowBuilder().addComponents(statusMenu)];
    }

    async updateTicketMessage(channel, ticket) {
        try {
            const msgs = await channel.messages.fetch({ limit: 20 }).catch(()=>null);
            if (!msgs) return;
            const welcome = [...msgs.values()].find(m => m.author.id === this.client.user.id && m.embeds.length && (m.embeds[0].title?.includes("New Ticket") || m.embeds[0].title?.includes("Ticket")));
            if (!welcome) return;
            const rows = this.buildTicketRows(channel.id, ticket);
            await welcome.edit({ components: rows }).catch(()=>{});
        } catch {}
    }

    async isTicketStaff(member, guildId) {
        try {
            if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
        } catch { return false; }
        const cfg = await this.settings.get(guildId).catch(() => null);
        try {
            return isStaff(member, cfg);
        } catch { return false; }
    }
    async requireTicketStaff(i) {
        if (await this.isTicketStaff(i.member, i.guild.id)) return true;
        await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can use ticket controls.")], flags: MessageFlags.Ephemeral }).catch(() => {});
        return false;
    }
    async fetchScopedTicket(i, channelId) {
        const ticket = await this.prisma.ticket.findUnique({ where: { channelId } }).catch(() => null);
        if (!ticket) {
            await i.reply({ embeds: [embeds.error("Not found", "Ticket not in DB")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return null;
        }
        if (ticket.guildId !== i.guild.id || ticket.channelId !== i.channelId) {
            await i.reply({ embeds: [embeds.error("Denied", "This ticket does not belong to this channel.")], flags: MessageFlags.Ephemeral }).catch(() => {});
            return null;
        }
        return ticket;
    }
    async canViewTicket(i, ticket) {
        const uid = i.user.id;
        if (ticket.openerId === uid) return true;
        if (ticket.claimedById && ticket.claimedById === uid) return true;
        return this.isTicketStaff(i.member, i.guild.id);
    }
    // Ticket controls
    async handleClaim(i) {
        if (!i.isButton()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (ticket.status === STATUS.CLOSED) return i.reply({ embeds:[embeds.warn("Closed","Ticket is closed")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        const type = ticket.typeId ? await this.prisma.ticketType.findUnique({ where:{ id: ticket.typeId } }).catch(()=>null) : null;
        if (type && !type.allowClaim) return i.reply({ embeds:[embeds.warn("Claim disabled","Claiming disabled for this type")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        if (ticket.claimedById && ticket.claimedById !== i.user.id) return i.reply({ embeds:[embeds.warn("Claimed",`Already claimed by <@${ticket.claimedById}>`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        let updated;
        try {
            updated = await this.prisma.ticket.update({ where:{ channelId }, data:{ claimedById: i.user.id, status: STATUS.CLAIMED } });
        } catch (e) {
            logger.error("tickets", "claim update failed", e);
            return i.reply({ embeds:[embeds.error("Failed","Could not claim ticket")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        await i.reply({ embeds:[embeds.success("Claimed",`You claimed this ticket`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(()=>null);
        if (ch) {
            await ch.send({ embeds:[embeds.info("Claimed", `<@${i.user.id}> claimed this ticket`)] }).catch(()=>{});
            await this.updateTicketMessage(ch, updated);
        }
    }
    async handleUnclaim(i) {
        if (!i.isButton()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        let updated;
        try {
            updated = await this.prisma.ticket.update({ where:{ channelId }, data:{ claimedById: null, status: STATUS.OPEN } });
        } catch (e) {
            logger.error("tickets", "unclaim update failed", e);
            return i.reply({ embeds:[embeds.error("Failed","Could not unclaim ticket")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        await i.reply({ embeds:[embeds.success("Unclaimed","Ticket unclaimed")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(()=>null);
        if (ch) await this.updateTicketMessage(ch, updated);
    }
    async handleStatusSelect(i) {
        if (!i.isStringSelectMenu()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        const val = i.values[0];
        try {
            await this.prisma.ticket.update({ where:{ channelId }, data:{ status: val } });
        } catch (e) {
            logger.error("tickets", "status update failed", e);
            return i.reply({ embeds:[embeds.error("Failed","Could not update status")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        await i.reply({ embeds:[embeds.success("Status",`Status set to ${val}`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ch = i.guild.channels.cache.get(channelId);
        if (ch) await ch.send({ embeds:[embeds.info("Status update", `Status → **${val}** by <@${i.user.id}>`)] }).catch(()=>{});
    }
    async handlePrioritySelect(i) {
        if (!i.isStringSelectMenu()) return;
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        const val = i.values[0];
        try {
            await this.prisma.ticket.update({ where:{ channelId }, data:{ priority: val } });
        } catch (e) {
            logger.error("tickets", "priority update failed", e);
            return i.reply({ embeds:[embeds.error("Failed","Could not update priority")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        await i.reply({ embeds:[embeds.success("Priority",`Priority set to ${val}`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    async handleAddUser(i) {
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (i.customId.endsWith(":menu")) {
            if (!i.isUserSelectMenu()) return;
            const uid = i.values[0];
            const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(()=>null);
            if (ch) await ch.permissionOverwrites.edit(uid, { ViewChannel:true, SendMessages:true, ReadMessageHistory:true, AttachFiles:true }).catch(()=>{});
            return i.reply({ embeds:[embeds.success("Added", `<@${uid}> added`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        const menu = new UserSelectMenuComponent({ custom_id: `ticket:add:${channelId}:menu`, placeholder: "Select user" });
        await i.reply({ embeds:[embeds.info("Add user","Pick user to add")], components:[new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    async handleRemoveUser(i) {
        if (!await this.requireTicketStaff(i)) return;
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (i.customId.endsWith(":menu")) {
            if (!i.isUserSelectMenu()) return;
            const uid = i.values[0];
            const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(()=>null);
            if (ch) await ch.permissionOverwrites.delete(uid).catch(()=>{});
            return i.reply({ embeds:[embeds.success("Removed", `<@${uid}> removed`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        const menu = new UserSelectMenuComponent({ custom_id: `ticket:remove:${channelId}:menu`, placeholder: "Select user" });
        await i.reply({ embeds:[embeds.info("Remove user","Pick user to remove")], components:[new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    async handleInfo(i) {
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (!await this.canViewTicket(i, ticket)) {
            return i.reply({ embeds:[embeds.error("Denied","Only the ticket opener or staff can view this.")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        const ch = i.guild.channels.cache.get(channelId);
        const msgCount = ch ? (await ch.messages.fetch({ limit:100 }).catch(()=>null))?.size ?? "?" : "?";
        await i.reply({ embeds:[embeds.info("Ticket Info", `Channel: <#${channelId}>`, [
            {name:"ID", value: ticket.id, inline:true},
            {name:"Opener", value:`<@${ticket.openerId}>`, inline:true},
            {name:"Type", value: ticket.typeId ?? ticket.panelType ?? "—", inline:true},
            {name:"Status", value: ticket.status, inline:true},
            {name:"Priority", value: ticket.priority, inline:true},
            {name:"Claimed", value: ticket.claimedById ? `<@${ticket.claimedById}>` : "—", inline:true},
            {name:"Created", value:`<t:${Math.floor(ticket.createdAt.getTime()/1000)}:R>`, inline:true},
            {name:"Messages", value: String(msgCount), inline:true},
        ])], flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    async handleClose(i) {
        const channelId = i.customId.split(":")[2];
        if (!await this.requireTicketStaff(i)) return;
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        // Confirm
        if (!i.customId.includes(":confirm")) {
            return i.reply({ embeds:[embeds.warn("Close ticket","Confirm closing? This will archive and optionally create transcript.")], components:[confirmationRow({ acceptCustomId:`ticket:close:${channelId}:confirm`, cancelCustomId:`ticket:close:${channelId}:cancel`, acceptLabel:"Close", danger:true })], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        if (i.customId.endsWith(":cancel")) return i.update({ embeds:[embeds.info("Cancelled","Not closed")], components:[] }).catch(()=>{});
        await i.deferUpdate().catch(()=>{});
        try {
            await this.prisma.ticket.update({ where:{ channelId }, data:{ status: STATUS.CLOSED, closedAt: new Date() } });
        } catch (e) {
            logger.error("tickets", "close update failed", e);
            return i.editReply({ embeds:[embeds.error("Failed","Could not close ticket")] }).catch(()=>{});
        }
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(()=>null);
        if (ch) {
            await ch.send({ embeds:[embeds.info("Closed",`Closed by <@${i.user.id}> — archiving...`)] }).catch(()=>{});
            // Build HTML transcript
            let htmlFile=null;
            try {
                const msgs = await ch.messages.fetch({ limit:100 });
                const sorted=[...msgs.values()].sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
                const branding=await this.client?.services?.branding?.get(i.guild.id).catch(()=>null);
const displayName=branding?.displayName || ".pulse";
                const html=this.buildHtmlTranscript({ channel:ch, ticket, guild:i.guild, messages:sorted, displayName, closerId:i.user.id });
                const buf=Buffer.from(html,"utf-8");
                htmlFile={ attachment: buf, name: `transcript-${ch.name}-${ticket.id.slice(0,4)}.html` };
            } catch (e) { logger.error("tickets","html transcript failed", e); }
            // Archive: move to archive category, rename, lock
            try{
                // Find or create archive category
                let archiveCat = i.guild.channels.cache.find(c=> c.type===ChannelType.GuildCategory && ["archive","archives","tickets-archive","closed","closed-tickets"].includes(c.name.toLowerCase()));
                if(!archiveCat){
                    try{
                        archiveCat=await i.guild.channels.create({ name:"archive", type:ChannelType.GuildCategory }).catch(()=>null);
                    }catch{}
                }
                if(archiveCat && ch.parentId!==archiveCat.id){
                    await ch.setParent(archiveCat.id).catch(()=>{});
                }
                // Rename to archived- prefix and lock sending
                const baseName=ch.name.replace(/^archived-/,"");
                await ch.setName(`archived-${baseName}`.slice(0,100)).catch(()=>{});
                await ch.permissionOverwrites.edit(i.guild.roles.everyone.id, { ViewChannel:true, SendMessages:false }).catch(()=>{});
                // Also deny opener from sending (archive read-only)
                await ch.permissionOverwrites.edit(ticket.openerId, { ViewChannel:true, SendMessages:false }).catch(()=>{});
                // Set topic
                await ch.setTopic(`Archived • ${ticket.id} • Closed by ${i.user.tag} • ${new Date().toISOString()}`).catch(()=>{});
            }catch(e){ logger.error("tickets","archive move failed",e); }
            // Send transcript to mod log and user
            try{
                const cfg = await this.client?.services?.settings.get(i.guild.id).catch(()=>null);
                if (cfg?.modLogChannelId && htmlFile) {
                    const logCh = i.guild.channels.cache.get(cfg.modLogChannelId) ?? await i.guild.channels.fetch(cfg.modLogChannelId).catch(()=>null);
                    if (logCh?.isTextBased()) await logCh.send({ embeds:[embeds.moderation("Ticket Archived",`Ticket <#${channelId}> (\`${ch.name}\`) closed by <@${i.user.id}> • HTML archived`, [{name:"Category", value: ticket.panelType||"—", inline:true},{name:"Opener", value:`<@${ticket.openerId}>`, inline:true}])], files:[htmlFile] }).catch(()=>{});
                }
                if(htmlFile) await i.user.send({ embeds:[embeds.info("Transcript",`Your ticket \`${ch.name}\` has been archived — HTML transcript attached`)], files:[htmlFile] }).catch(()=>{});
                // Also send HTML to ticket channel itself for record
                if(htmlFile) await ch.send({ embeds:[embeds.info("Archived",`This ticket is now archived. HTML transcript saved.`)], files:[htmlFile] }).catch(()=>{});
            }catch(e){ logger.error("tickets","archive send failed",e); }
            // Save transcript reference to DB
            try{ await this.prisma.ticket.update({ where:{ channelId }, data:{ transcript: `archived-${ch.name}.html` }}); }catch(e){ logger.error("tickets","transcript ref save failed",e); }
        }
        await i.editReply({ embeds:[embeds.success("Closed & Archived","Ticket archived — HTML transcript created")] , components:[] }).catch(()=>{});
    }
    buildHtmlTranscript({ channel, ticket, guild, messages, displayName, closerId }){
        const esc = (s)=> String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        const rows = messages.map(m=>{
            const time=m.createdAt.toLocaleString();
            const avatar=m.author.displayAvatarURL?.() || "";
            const content=esc(m.content||"").replace(/\n/g,"<br>");
            const attachments=(m.attachments?.size ? [...m.attachments.values()].map(a=> `<a href="${esc(a.url)}" target="_blank">${esc(a.name||"attachment")}</a>`).join("<br>") : "");
            return `<div class="msg"><img class="av" src="${esc(avatar)}" onerror="this.style.display='none'"><div><div class="meta"><span class="author">${esc(m.author.tag)}</span> <span class="time">${esc(time)}</span></div><div class="content">${content || "<i>embed/attachment</i>"}${attachments?`<div class="atts">${attachments}</div>`:""}</div></div></div>`;
        }).join("\n");
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript — ${esc(channel.name)}</title>
<style>
body{font-family:Inter,system-ui,Arial;background:#313338;color:#dcddde;margin:0;padding:0}
.header{background:#2b2d31;padding:24px 32px;border-bottom:1px solid #232428}
.header h1{margin:0;font-size:24px;color:#fff} .header p{color:#b5bac1;margin:6px 0 0}
.banner{width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin:16px 0}
.container{max-width:900px;margin:0 auto;padding:24px}
.msg{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #3f4147}
.av{width:40px;height:40px;border-radius:50%;flex-shrink:0}
.meta{font-size:14px} .author{font-weight:600;color:#fff} .time{color:#949ba4;font-size:12px;margin-left:8px}
.content{margin-top:4px;white-space:pre-wrap;word-break:break-word;color:#dcddde}
.atts{margin-top:6px;font-size:12px}
.footer{padding:24px;text-align:center;color:#949ba4;font-size:12px;border-top:1px solid #232428;margin-top:24px}
.badge{display:inline-block;background:#5865f2;color:#fff;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:8px}
</style></head><body>
<div class="header"><h1>${esc(ticket.panelType||"Ticket")} — ${esc(channel.name)} <span class="badge">${esc(ticket.status||"CLOSED")}</span></h1><p>Guild: ${esc(guild.name)} • Ticket: ${esc(ticket.id)} • Opener: ${esc(ticket.openerId)} • Closed by: ${esc(closerId||"system")} • ${new Date().toLocaleString()}</p></div>
<div class="container"><p style="color:#b5bac1">Archived transcript — ${messages.length} messages</p>
<hr style="border:0;border-top:1px solid #3f4147;margin:16px 0">
${rows}
<div class="footer">Guild: ${esc(guild.name)} • Generated ${new Date().toISOString()}</div></div></body></html>`;
    }
    async handleTranscript(i) {
        const channelId = i.customId.split(":")[2];
        const ticket = await this.fetchScopedTicket(i, channelId);
        if (!ticket) return;
        if (!await this.canViewTicket(i, ticket)) {
            return i.reply({ embeds:[embeds.error("Denied","Only the ticket opener or staff can view transcripts.")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ch = i.guild.channels.cache.get(channelId) ?? await i.guild.channels.fetch(channelId).catch(()=>null);
        if (!ch) return i.editReply({ embeds:[embeds.error("Not found","Channel missing")] }).catch(()=>{});
        const msgs = await ch.messages.fetch({ limit:100 }).catch(()=>null);
        if (!msgs) return i.editReply({ embeds:[embeds.error("Failed","Cannot fetch")] }).catch(()=>{});
        // Prefer HTML with fallback txt
        try{
            const ticket=await this.prisma.ticket.findUnique({ where:{ channelId }}).catch(()=>null);
            const sorted=[...msgs.values()].sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
            const branding=await this.client?.services?.branding?.get(i.guild.id).catch(()=>null);
            const displayName=branding?.displayName || ".pulse";
            const html=this.buildHtmlTranscript({ channel:ch, ticket: ticket||{ id:channelId, panelType:"Ticket", status:"OPEN", openerId:"unknown" }, guild:i.guild, messages:sorted, displayName, closerId:i.user.id });
            const file={ attachment: Buffer.from(html,"utf-8"), name: `transcript-${ch.name}.html` };
            return i.editReply({ embeds:[embeds.success("Transcript","HTML transcript")], files:[file] }).catch(()=>{});
        }catch{
            const lines = [`Transcript #${ch.name}`];
            for (const m of [...msgs.values()].reverse()) lines.push(`[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`);
            const file = { attachment: Buffer.from(lines.join("\n"),"utf-8"), name: `transcript-${channelId}.txt` };
            await i.editReply({ embeds:[embeds.success("Transcript","Here")], files:[file] }).catch(()=>{});
        }
    }

    async checkDeletions(){
        // Find tickets that are CLOSED and archived, and whose closedAt + delay has passed, then delete channel
        // This runs every 60s and on startup, so survives restarts
        try{
            const allClosed=await this.prisma.ticket.findMany({ where:{ status: STATUS.CLOSED, closedAt:{ not:null } }, take:50 }).catch(()=>[]);
            const now=Date.now();
            for(const t of allClosed){
                if(!t.closedAt) continue;
                const delay=await this.getDeletionDelayMsAsync(t.guildId).catch(()=> this.getDeletionDelayMs(t.guildId));
                const deleteAt=new Date(t.closedAt).getTime() + delay;
                if(now < deleteAt) continue; // not yet
                // Check if channel still exists
                const guild=this.client.guilds.cache.get(t.guildId);
                if(!guild){
                    // Guild not cached (bot maybe not in guild or not ready), skip and retry next cycle
                    continue;
                }
                const ch=guild.channels.cache.get(t.channelId) ?? await guild.channels.fetch(t.channelId).catch(()=>null);
                if(!ch){
                    // Channel already deleted externally; clean up DB transcript flag but keep ticket row for history (don't delete row)
                    // Optionally we could delete ticket row, but keep for audit; just mark transcript as deleted
                    continue;
                }
                // Check permissions to delete
                const me=guild.members.me;
                if(!me?.permissions.has(PermissionFlagsBits.ManageChannels)){
                    logger.warn("tickets",`cannot auto-delete ${t.channelId} — missing ManageChannels in ${guild.id}`);
                    continue;
                }
                // Verify channel is archived (starts with archived- or is in archive category) to avoid premature deletion
                const isArchived = ch.name.startsWith("archived-") || ch.parent?.name?.toLowerCase().includes("archive");
                if(!isArchived){
                    // Not yet archived via handleClose, skip (maybe still open or not properly closed)
                    continue;
                }
                // Delete channel with audit reason
                try{
                    await ch.delete(`Auto-deletion after ${Math.round(delay/60000)}m — ticket ${t.id}`).catch(e=>{ throw e; });
                    await this.client?.services?.audit?.log(t.guildId,{ action:"ticket_auto_delete", category:"tickets", details:{ channelId: t.channelId, ticketId: t.id }}).catch(()=>{});
                    // Keep ticket row for history, but we could also delete it; keep for now
                    logger.info("tickets",`auto-deleted archived ticket ${t.channelId} in ${t.guildId}`);
                }catch(e){
                    logger.error("tickets","auto-delete failed",e);
                }
            }
        }catch(e){ logger.error("tickets","checkDeletions outer failed",e); }
    }

    // Ticket list: [category][user][id]
    async listTickets(guildId, { status=null, category=null, userId=null, limit=10, offset=0 }={}){
        const where={ guildId };
        if(status) where.status=status;
        if(category) where.panelType=category;
        if(userId) where.openerId=userId;
        const [rows, total]=await Promise.all([
            this.prisma.ticket.findMany({ where, orderBy:{ createdAt:"desc" }, take: Math.min(limit,25), skip: offset }).catch(()=>[]),
            this.prisma.ticket.count({ where }).catch(()=>0)
        ]);
        // Enrich with type display
        const typeIds=[...new Set(rows.map(r=>r.typeId).filter(Boolean))];
        const types=typeIds.length ? await this.prisma.ticketType.findMany({ where:{ id:{ in: typeIds }}}).catch(()=>[]) : [];
        const typeMap=new Map(types.map(t=>[t.id, t]));
        return {
            rows: rows.map(r=>{
                const t= r.typeId ? typeMap.get(r.typeId) : null;
                const cat = t?.displayName || r.panelType || "Ticket";
                const shortId = r.id.slice(0,4).toLowerCase();
                return { ...r, category: cat, shortId, display: `[${cat}][<@${r.openerId}>][${shortId}]` };
            }),
            total
        };
    }
}
