import {
    ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle,
    ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, AttachmentBuilder,
    ChannelType, PermissionFlagsBits, time, MessageFlags,
} from "discord.js";
import { embeds, confirmationRow } from "../design/embeds.js";
import { logger } from "../core/logger.js";

const DEFAULT_DESIGN_CATEGORIES = [
    { value: "logo", label: "Logo", description: "Brand / server logos" },
    { value: "banner", label: "Banner", description: "Server or profile banners" },
    { value: "emote", label: "Emote / Emoji", description: "Custom emotes and emoji" },
    { value: "overlay", label: "Stream Overlay", description: "Twitch / OBS overlays" },
    { value: "thumbnail", label: "Thumbnail", description: "YouTube / social thumbnails" },
    { value: "other", label: "Other", description: "Something else" },
];

const STATUS_LABELS = {
    BRIEF: "Brief · Awaiting info",
    CLAIMED: "Claimed",
    IN_PROGRESS: "In Progress",
    REVIEW: "Awaiting Review",
    REVISION: "Revision",
    DELIVERED: "Delivered",
    PAID: "Paid",
    CLOSED: "Closed",
};

const BASE_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];

export class OrderService {
    prisma;
    client;
    settings;
    introMessages = new Map();
    constructor(prisma, client, settings) {
        this.prisma = prisma;
        this.client = client;
        this.settings = settings;
        this.registerStaticHandlers();
        this.registerControlHandlers();
    }
    get components() {
        return this.client.components;
    }
    getCategories(config) {
        const list = config?.orders?.categories;
        if (Array.isArray(list) && list.length)
            return list;
        return DEFAULT_DESIGN_CATEGORIES;
    }
    registerStaticHandlers() {
        this.components.set("order:open", async (i) => {
            if (!i.isButton())
                return;
            await this.handleOpen(i);
        });
        this.components.set("order:category", async (i) => {
            if (!i.isStringSelectMenu())
                return;
            await this.handleCategorySelect(i);
        });
        this.components.set("order:create", async (i) => {
            if (!i.isModalSubmit())
                return;
            await this.handleCreateModal(i);
        });
    }
    registerControlHandlers() {
        this.components.set("order:claim", async (i) => this.handleClaim(i));
        this.components.set("order:status", async (i) => this.handleStatus(i));
        this.components.set("order:close", async (i) => this.handleClose(i));
        this.components.set("order:add", async (i) => this.handleAddUser(i));
        this.components.set("order:remove", async (i) => this.handleRemoveUser(i));
        this.components.set("order:transcript", async (i) => this.handleTranscript(i));
    }
    // --- Panel command support -------------------------------------------------
    buildPanelEmbed() {
        const cats = this.getCategories(null);
        return embeds.info("Design Orders", "Request a commission from our designers. Only you and the design team can see the channel. Pick a category below to start your brief.", [
            { name: "What we take", value: cats.map((c) => `**${c.label}** — ${c.description}`).join("\n"), inline: false },
            { name: "How it works", value: "1) Pick a category  2) Fill the brief  3) A designer claims it  4) Track status live in this channel.", inline: false },
        ]);
    }
    buildOpenButton() {
        return new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId("order:open")
            .setLabel("Request Design")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎨"));
    }
    async handleOpen(i) {
        const member = i.member;
        const existing = await this.prisma.order.findFirst({
            where: { guildId: i.guild.id, openerId: member.id, status: { not: "CLOSED" } },
        });
        if (existing) {
            await i.reply({
                embeds: [embeds.warn("Order already open", `You already have an order at <#${existing.channelId}>.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const cats = this.getCategories(await this.settings.get(i.guild.id).catch(() => null));
        const menu = new StringSelectMenuBuilder()
            .setCustomId("order:category")
            .setPlaceholder("Choose a design category")
            .addOptions(cats);
        await i.reply({
            embeds: [embeds.info("New design order", "Select the type of design you want commissioned.")],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: MessageFlags.Ephemeral,
        });
    }
    async handleCategorySelect(i) {
        const category = i.values[0];
        const modal = new ModalBuilder()
            .setCustomId(`order:create:${category}`)
            .setTitle(`Brief · ${category}`);
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Describe the design")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Theme, style, references to mood, colors, text to include...")
                .setRequired(true)
                .setMaxLength(1000)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId("budget")
                .setLabel("Budget")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. 10k coins / $20 / negotiable")
                .setRequired(false)
                .setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId("deadline")
                .setLabel("Deadline")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. 2024-12-31 or '2 weeks'")
                .setRequired(false)
                .setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId("references")
                .setLabel("Reference links")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Paste any inspiration / reference URLs (one per line)")
                .setRequired(false)
                .setMaxLength(1000)),
        );
        await i.showModal(modal);
    }
    async handleCreateModal(i) {
        const category = i.customId.split(":")[2] ?? "other";
        const description = i.fields.getTextInputValue("description");
        const budget = i.fields.getTextInputValue("budget") || null;
        const deadlineRaw = i.fields.getTextInputValue("deadline") || null;
        const references = i.fields.getTextInputValue("references") || null;
        const deadline = this.parseDeadline(deadlineRaw);
        const guild = i.guild;
        const opener = i.member;
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const order = await this.createOrder({ guild, opener, category, description, budget, deadline, references });
            await i.editReply({
                embeds: [embeds.success("Order created", `Your design order is ready at <#${order.channelId}>. A designer will claim it shortly.`)],
                components: [],
            });
        }
        catch (e) {
            logger.error("orders", "create failed", e);
            await i.editReply({
                embeds: [embeds.error("Could not create order", "An unexpected error occurred while creating your order.")],
                components: [],
            });
        }
    }
    parseDeadline(raw) {
        if (!raw)
            return null;
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime()))
            return d;
        return null;
    }
    // --- Core creation ---------------------------------------------------------
    sanitizeName(input) {
        let name = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!name)
            name = "user";
        return name.slice(0, 26);
    }
    async findParent(guild) {
        const candidates = ["orders", "open-orders", "design-orders", "commissions"];
        for (const c of guild.channels.cache.values()) {
            if (c.type !== ChannelType.GuildCategory)
                continue;
            if (candidates.includes(c.name.toLowerCase()))
                return c;
        }
        return null;
    }
    async uniqueChannelName(guild, base) {
        const parent = await this.findParent(guild);
        const siblings = new Map();
        for (const ch of guild.channels.cache.values()) {
            if (ch.parentId === parent?.id || (!parent && ch.type === ChannelType.GuildText)) {
                siblings.set(ch.name, (siblings.get(ch.name) ?? 0) + 1);
            }
        }
        let name = base;
        let suffix = 1;
        while (siblings.has(name)) {
            const trimmed = base.slice(0, 28 - String(suffix).length - 1);
            name = `${trimmed}-${suffix}`;
            suffix++;
        }
        return name;
    }
    async buildOverwrites(guild, openerId, config) {
        const roleIds = [...config.staffRoleIds, ...config.moderatorRoleIds];
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: openerId, allow: [...BASE_PERMS] },
        ];
        for (const id of roleIds) {
            overwrites.push({ id, allow: [...BASE_PERMS, PermissionFlagsBits.ManageMessages] });
        }
        return overwrites;
    }
    async createOrder(input) {
        const { guild, opener, category, description, budget, deadline, references } = input;
        const config = await this.settings.get(guild.id);
        const parent = await this.findParent(guild);
        const label = this.getCategories(config).find((c) => c.value === category)?.label ?? category;
        const baseName = this.sanitizeName(`order-${opener.user.username}`);
        const name = await this.uniqueChannelName(guild, baseName);
        const overwrites = await this.buildOverwrites(guild, opener.id, config);
        const channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: parent?.id,
            topic: `Order · ${opener.user.tag} · ${label}`,
            permissionOverwrites: overwrites,
        });
        const order = await this.prisma.order.create({
            data: {
                guildId: guild.id,
                channelId: channel.id,
                openerId: opener.id,
                category,
                status: "BRIEF",
                brief: description,
                budget,
                deadline,
                references,
            },
        });
        const embed = await this.buildIntroEmbed(order, opener.user.tag);
        const row = this.buildControlRow(channel.id);
        const sent = await channel.send({ content: `<@${opener.id}>`, embeds: [embed], components: row });
        this.introMessages.set(channel.id, sent.id);
        this.registerControlHandlers();
        await this.logOrder(guild, order, `Order opened by ${opener.user.tag} (${label})`);
        return { channelId: channel.id };
    }
    buildIntroEmbed(order, openerTag) {
        const fields = [
            { name: "Opened by", value: `${openerTag} (\`${order.openerId}\`)`, inline: true },
            { name: "Type", value: order.category, inline: true },
            { name: "Status", value: STATUS_LABELS[order.status] ?? order.status, inline: true },
            { name: "Brief", value: order.brief || "*(none provided)*" },
        ];
        if (order.budget)
            fields.push({ name: "Budget", value: order.budget, inline: true });
        if (order.deadline)
            fields.push({ name: "Deadline", value: time(order.deadline, "R"), inline: true });
        if (order.references)
            fields.push({ name: "References", value: order.references.slice(0, 1024) });
        if (order.claimedById)
            fields.push({ name: "Designer", value: `<@${order.claimedById}>`, inline: true });
        return embeds.neutral("Design order opened", "A designer will claim this order and update its status here.", fields);
    }
    buildControlRow(channelId) {
        const claim = new ButtonBuilder()
            .setCustomId(`order:claim:${channelId}`)
            .setLabel("Claim")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅");
        const status = new StringSelectMenuBuilder()
            .setCustomId(`order:status:${channelId}`)
            .setPlaceholder("Update status")
            .addOptions([
                { label: "In Progress", value: "IN_PROGRESS" },
                { label: "Awaiting Review", value: "REVIEW" },
                { label: "Revision", value: "REVISION" },
                { label: "Delivered", value: "DELIVERED" },
                { label: "Paid", value: "PAID" },
                { label: "Close Order", value: "CLOSED" },
            ]);
        const add = new ButtonBuilder().setCustomId(`order:add:${channelId}`).setLabel("Add User").setStyle(ButtonStyle.Primary).setEmoji("➕");
        const remove = new ButtonBuilder().setCustomId(`order:remove:${channelId}`).setLabel("Remove User").setStyle(ButtonStyle.Secondary).setEmoji("➖");
        const transcript = new ButtonBuilder().setCustomId(`order:transcript:${channelId}`).setLabel("Transcript").setStyle(ButtonStyle.Secondary).setEmoji("📄");
        return [
            new ActionRowBuilder().addComponents(claim, status),
            new ActionRowBuilder().addComponents(add, remove, transcript),
        ];
    }
    async getOrderChannel(guild, channelId) {
        const ch = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
        return ch ?? null;
    }
    async editIntro(channelId, embed) {
        const channel = this.client.channels.cache.get(channelId) ?? null;
        if (!channel)
            return;
        const msgId = this.introMessages.get(channelId);
        const target = msgId ? await channel.messages.fetch(msgId).catch(() => null) : null;
        if (target) {
            await target.edit({ embeds: [embed] }).catch(() => { });
            return;
        }
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        const intro = messages?.find((m) => m.author.id === this.client.user?.id && m.embeds.length > 0);
        if (intro) {
            this.introMessages.set(channelId, intro.id);
            await intro.edit({ embeds: [embed] }).catch(() => { });
        }
    }
    // --- Control handlers ------------------------------------------------------
    parseChannelId(customId, prefix) {
        // customId format: order:<action>:<channelId>[:suffix]
        // e.g., "order:claim:123456" or "order:close:123456:confirm"
        const parts = customId.split(":");
        if (parts[0] !== "order") return null;
        if (prefix && `order:${parts[1]}` !== prefix) return null;
        return parts[2] ?? null;
    }
    async fetchOrder(channelId) {
        return this.prisma.order.findUnique({ where: { channelId } }).catch(() => null);
    }
    async refreshIntro(guild, order) {
        const opener = await guild.members.fetch(order.openerId).catch(() => null);
        const embed = await this.buildIntroEmbed(order, opener?.user.tag ?? order.openerId);
        await this.editIntro(order.channelId, embed);
    }
    async handleClaim(i) {
        if (!i.isButton())
            return;
        const channelId = this.parseChannelId(i.customId, "order:claim");
        if (!channelId)
            return;
        const member = i.member;
        const config = await this.settings.get(i.guild.id).catch(() => null);
        if (!this.isStaffMember(member, config)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can claim orders.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const order = await this.fetchOrder(channelId);
        if (!order || order.status === "CLOSED") {
            await i.reply({ embeds: [embeds.warn("Order unavailable", "This order is not open.")], flags: MessageFlags.Ephemeral });
            return;
        }
        if (order.claimedById && order.claimedById !== member.id) {
            await i.reply({ embeds: [embeds.warn("Already claimed", "Another designer already claimed this order.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const updated = await this.prisma.order.update({ where: { channelId }, data: { claimedById: member.id, status: "CLAIMED" } });
        await this.refreshIntro(i.guild, updated);
        await i.reply({ embeds: [embeds.success("Order claimed", `You claimed this order.`)], flags: MessageFlags.Ephemeral });
        await i.guild.channels.cache.get(channelId)?.send({ embeds: [embeds.info("Designer assigned", `<@${member.id}> claimed this order and will begin work.`)] }).catch(() => { });
    }
    async handleStatus(i) {
        if (!i.isStringSelectMenu())
            return;
        const channelId = this.parseChannelId(i.customId, "order:status");
        if (!channelId)
            return;
        const member = i.member;
        const config = await this.settings.get(i.guild.id).catch(() => null);
        if (!this.isStaffMember(member, config)) {
            await i.reply({ embeds: [embeds.error("Missing permission", "Only staff can update order status.")], flags: MessageFlags.Ephemeral });
            return;
        }
        const next = i.values[0];
        const order = await this.fetchOrder(channelId);
        if (!order || order.status === "CLOSED") {
            await i.reply({ embeds: [embeds.warn("Order unavailable", "This order is not open.")], flags: MessageFlags.Ephemeral });
            return;
        }
        if (next === "CLOSED") {
            await i.reply({
                embeds: [embeds.warn("Close order", "This will lock the channel, mark the order paid/closed, and generate a transcript. Continue?")],
                components: [
                    confirmationRow({
                        acceptCustomId: `order:close:${channelId}:confirm`,
                        cancelCustomId: `order:close:${channelId}:cancel`,
                        acceptLabel: "Close order",
                        danger: true,
                    }),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const updated = await this.prisma.order.update({ where: { channelId }, data: { status: next } });
        await this.refreshIntro(i.guild, updated);
        await i.reply({ embeds: [embeds.success("Status updated", `Order status set to **${STATUS_LABELS[next]}**.`)], flags: MessageFlags.Ephemeral });
        const channel = i.guild.channels.cache.get(channelId);
        if (channel)
            await channel.send({ embeds: [embeds.info("Status update", `<@${order.openerId}> — your order status is now **${STATUS_LABELS[next]}**.`)] }).catch(() => { });
        await this.logOrder(i.guild, updated, `Status → ${STATUS_LABELS[next]} by ${member.user.tag}`);
    }
    async handleClose(i) {
        if (!i.isButton() && !i.isStringSelectMenu())
            return;
        const channelId = this.parseChannelId(i.customId, "order:close");
        if (!channelId)
            return;
        if (i.customId.endsWith(":confirm")) {
            await i.deferUpdate().catch(() => { });
            const order = await this.fetchOrder(channelId);
            await this.closeOrder(i.guild, channelId, i.member, order?.claimedById ?? i.member.id);
            await i.editReply({ embeds: [embeds.success("Order closed", "This order has been closed.")], components: [] }).catch(() => { });
            return;
        }
        if (i.customId.endsWith(":cancel")) {
            await i.update({ embeds: [embeds.info("Cancelled", "The order was not closed.")], components: [] }).catch(() => { });
            return;
        }
        const order = await this.fetchOrder(channelId);
        if (!order || order.status === "CLOSED") {
            await i.reply({ embeds: [embeds.warn("Order unavailable", "This order is not open.")], flags: MessageFlags.Ephemeral });
            return;
        }
        await i.reply({
            embeds: [embeds.warn("Close order", "This will lock the channel and generate a transcript. Continue?")],
            components: [
                confirmationRow({
                    acceptCustomId: `order:close:${channelId}:confirm`,
                    cancelCustomId: `order:close:${channelId}:cancel`,
                    acceptLabel: "Close order",
                    danger: true,
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
    async closeOrder(guild, channelId, closer, claimedById) {
        const channel = await this.getOrderChannel(guild, channelId);
        if (!channel)
            return;
        const transcript = await this.buildTranscriptText(channel).catch(() => null);
        const order = await this.fetchOrder(channelId);
        await this.prisma.order.update({
            where: { channelId },
            data: { status: "CLOSED", closedAt: new Date(), transcript: transcript ?? undefined, claimedById: claimedById ?? order?.claimedById },
        }).catch(() => { });
        const everyone = guild.roles.everyone;
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false, ViewChannel: false }).catch(() => { });
        await channel.permissionOverwrites.edit(closer.id, { SendMessages: false, ViewChannel: false }).catch(() => { });
        const finalOrder = await this.fetchOrder(channelId);
        if (finalOrder) {
            const opener = await guild.members.fetch(finalOrder.openerId).catch(() => null);
            if (opener)
                await channel.permissionOverwrites.edit(opener.id, { SendMessages: false }).catch(() => { });
        }
        const newName = `closed-${channel.name.replace(/^order-/, "").slice(0, 26)}`;
        await channel.setName(newName).catch(() => { });
        await channel.send({ embeds: [embeds.info("Order closed", `Closed by ${closer.user.tag}. A transcript was generated.`)] }).catch(() => { });
        if (transcript)
            await this.deliverTranscript(guild, channelId, transcript, "closed");
        if (finalOrder)
            await this.logOrder(guild, finalOrder, `Order closed by ${closer.user.tag}`);
    }
    async handleAddUser(i) {
        const channelId = this.parseChannelId(i.customId, "order:add");
        if (!channelId)
            return;
        if (i.customId.endsWith(":menu")) {
            if (!i.isUserSelectMenu())
                return;
            const userId = i.values[0];
            const channel = await this.getOrderChannel(i.guild, channelId);
            if (!channel)
                return;
            await channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }).catch(() => { });
            await i.reply({ embeds: [embeds.success("User added", `<@${userId}> can now access this order.`)], flags: MessageFlags.Ephemeral });
            return;
        }
        const menu = new UserSelectMenuBuilder().setCustomId(`order:add:${channelId}:menu`).setPlaceholder("Select a user to add");
        await i.reply({
            embeds: [embeds.info("Add user", "Pick a member to grant access to this order.")],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: MessageFlags.Ephemeral,
        });
    }
    async handleRemoveUser(i) {
        const channelId = this.parseChannelId(i.customId, "order:remove");
        if (!channelId)
            return;
        if (i.customId.endsWith(":menu")) {
            if (!i.isUserSelectMenu())
                return;
            const userId = i.values[0];
            const channel = await this.getOrderChannel(i.guild, channelId);
            if (!channel)
                return;
            const order = await this.fetchOrder(channelId);
            if (order && userId === order.openerId) {
                await i.reply({ embeds: [embeds.error("Cannot remove opener", "The order opener cannot be removed.")], flags: MessageFlags.Ephemeral });
                return;
            }
            await channel.permissionOverwrites.edit(userId, { ViewChannel: false, SendMessages: false }).catch(() => { });
            await i.reply({ embeds: [embeds.success("User removed", `<@${userId}> no longer has access to this order.`)], flags: MessageFlags.Ephemeral });
            return;
        }
        const menu = new UserSelectMenuBuilder().setCustomId(`order:remove:${channelId}:menu`).setPlaceholder("Select a user to remove");
        await i.reply({
            embeds: [embeds.info("Remove user", "Pick a member to revoke access from this order.")],
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: MessageFlags.Ephemeral,
        });
    }
    async handleTranscript(i) {
        if (!i.isButton())
            return;
        const channelId = this.parseChannelId(i.customId, "order:transcript");
        if (!channelId)
            return;
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const channel = await this.getOrderChannel(i.guild, channelId);
        if (!channel) {
            await i.editReply({ embeds: [embeds.error("Channel not found", "This order channel no longer exists.")] });
            return;
        }
        const text = await this.buildTranscriptText(channel).catch(() => null);
        if (!text) {
            await i.editReply({ embeds: [embeds.error("Transcript failed", "Could not collect messages for this order.")] });
            return;
        }
        const order = await this.fetchOrder(channelId);
        await this.deliverTranscript(i.guild, channelId, text, order?.status === "CLOSED" ? "archived" : "requested");
        await i.editReply({ embeds: [embeds.success("Transcript sent", "The transcript was delivered to your DMs and the mod-log channel.")] });
    }
    // --- Transcript helpers ----------------------------------------------------
    async buildTranscriptText(channel) {
        const messages = await channel.messages.fetch({ limit: 200 });
        const lines = [`Transcript for #${channel.name} (${channel.id})`, `Generated ${new Date().toISOString()}`, ""];
        for (const m of [...messages.values()].reverse()) {
            if (m.author.bot && m.embeds.length && !m.content)
                continue;
            const ts = m.createdAt.toISOString();
            const attachments = m.attachments.size ? ` [attachments: ${[...m.attachments.values()].map((a) => a.url).join(", ")}]` : "";
            lines.push(`[${ts}] ${m.author.tag}: ${m.content}${attachments}`);
        }
        return lines.join("\n");
    }
    async deliverTranscript(guild, channelId, text, kind) {
        const file = new AttachmentBuilder(Buffer.from(text, "utf-8")).setName(`transcript-${channelId}.txt`);
        const order = await this.fetchOrder(channelId);
        if (order) {
            const opener = await guild.members.fetch(order.openerId).catch(() => null);
            if (opener)
                await opener.send({ embeds: [embeds.info("Order transcript", `Your transcript (${kind}).`)], files: [file] }).catch(() => { });
        }
        const config = await this.settings.get(guild.id).catch(() => null);
        if (config?.modLogChannelId) {
            const ch = guild.channels.cache.get(config.modLogChannelId);
            if (ch)
                await ch.send({ embeds: [embeds.moderation("Order transcript", `Channel <#${channelId}> · ${kind}.`)], files: [file] }).catch(() => { });
        }
    }
    async logOrder(guild, order, note) {
        try {
            const ch = await this.client?.services?.logging.channel(guild, "mod");
            if (!ch)
                return;
            await ch.send({ embeds: [embeds.moderation(`Design Order · ${STATUS_LABELS[order.status] ?? order.status}`, note, [
                { name: "Channel", value: `<#${order.channelId}>`, inline: true },
                { name: "Type", value: order.category, inline: true },
                { name: "Opener", value: `<@${order.openerId}>`, inline: true },
            ])] }).catch(() => { });
        }
        catch (e) {
            logger.error("orders", "logOrder failed", e);
        }
    }
    async listOpen(guild) {
        return this.prisma.order.findMany({
            where: { guildId: guild.id, status: { not: "CLOSED" } },
            orderBy: { createdAt: "desc" },
            take: 25,
        });
    }
    isStaffMember(member, config) {
        if (member.permissions.has("Administrator") || member.permissions.has("ManageGuild"))
            return true;
        const roleIds = new Set(member.roles.cache.keys());
        if (!config)
            return false;
        if (config.staffRoleIds.some((id) => roleIds.has(id)))
            return true;
        if (config.moderatorRoleIds.some((id) => roleIds.has(id)))
            return true;
        return false;
    }
}
