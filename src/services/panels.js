import { ChannelType, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { embeds } from "../design/embeds.js";
import { Theme, Brand } from "../design/theme.js";
import { logger } from "../core/logger.js";

export const PANEL_TYPES = {
    ORDER: "ORDER",
    ASSISTANCE: "ASSISTANCE",
    REGULATIONS: "REGULATIONS",
    DASHBOARD: "DASHBOARD",
};

const PANEL_META = {
    [PANEL_TYPES.ORDER]: { label: "Orders", emoji: "🛒", defaultChannel: "orders", defaultTitle: "Place Your Order", color: Theme.accent },
    [PANEL_TYPES.ASSISTANCE]: { label: "Assistance", emoji: "🛟", defaultChannel: "support", defaultTitle: "Assistance Requests", color: Theme.accent },
    [PANEL_TYPES.REGULATIONS]: { label: "Regulations", emoji: "📜", defaultChannel: "rules", defaultTitle: "Regulations", color: Theme.accent },
    [PANEL_TYPES.DASHBOARD]: { label: "Dashboard", emoji: "📊", defaultChannel: "dashboard", defaultTitle: "Dashboard", color: Theme.accent },
};

const DEFAULT_PANELS = {
    [PANEL_TYPES.ORDER]: {
        title: "Place Your Order",
        description: "Select a category below to open a ticket.",
        bannerUrl: null,
        thumbnailUrl: null,
        embedColor: null,
        footerText: ".pulse • one ticket per request",
        footerIcon: null,
        sections: [
            { title: "What Happens Next", content: "```\n1 — Choose a service from the menu\n2 — Share your vision (references, budget, deadline)\n3 — A designer claims your ticket and begins\n```" },
            { title: "Before You Order", content: "> Provide clear references and dimensions\n> Respect payment and revision rules\n> Follow staff guidance with kindness\n> Need help? Open an Assistance ticket" },
        ],
        dropdownPlaceholder: "Choose a service to begin",
    },
    [PANEL_TYPES.ASSISTANCE]: {
        title: "Assistance",
        description: "Open a private ticket for support.",
        bannerUrl: null,
        sections: [
            { title: "Submitting a Request", content: "> Clearly explain your situation\n> Provide proof, screenshots, or IDs where relevant\n> One request per ticket — be concise and kind" },
            { title: "Review Process", content: "> Staff review within 24 hours\n> You'll be updated directly in the ticket\n> Urgent matters are prioritized" },
        ],
        dropdownPlaceholder: "Choose a request",
        footerText: ".pulse",
    },
    [PANEL_TYPES.REGULATIONS]: {
        title: "Regulations",
        description: "Follow these rules.",
        bannerUrl: null,
        subtitle: "Respect • Integrity",
        sections: [
            { title: "Essentials", content: "```\n•  Remain respectful and professional at all times\n•  Follow staff guidance\n•  Never impersonate others or misrepresent work\n•  Scamming, fraud, or deceptive practices are forbidden\n•  Do not interfere with another's transaction or order\n•  Honour Discord Terms of Service and community spirit\n```" },
            { title: "Conduct", content: "> Customer — Be clear and patient\n> Designer — Deliver with integrity, communicate, respect deadlines\n> Staff — Serve with fairness and transparency\n> AI — Disclose AI assistance where relevant" },
        ],
        footerText: ".pulse",
    },
    [PANEL_TYPES.DASHBOARD]: {
        title: ".pulse Dashboard",
        description: "Server overview and quick access.",
        bannerUrl: null,
        sections: [
            { title: "Our Community", content: "> Support and design services." },
            { title: "Our Purpose", content: "> Support and service requests." },
        ],
        dropdownPlaceholder: "Explore more",
        dropdownOptions: [
            { label: "About", value: "about", description: "Our story and values" },
            { label: "Services", value: "services", description: "What we create" },
            { label: "Team", value: "staff", description: "Meet the team" },
            { label: "Connect", value: "links", description: "Links & contact" },
            { label: "Regulations", value: "regulations", description: "Our covenant" },
        ],
        footerText: ".pulse",
    },
};

export class PanelService {
    prisma;
    client;
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async get(guildId, panelType) {
        let panel = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType } } }).catch(() => null);
        if (!panel) {
            const defaults = DEFAULT_PANELS[panelType] ?? {};
            panel = await this.prisma.panel.create({
                data: {
                    guildId,
                    panelType,
                    title: defaults.title ?? PANEL_META[panelType]?.defaultTitle ?? panelType,
                    description: defaults.description ?? "",
                    bannerUrl: defaults.bannerUrl ?? null,
                    embedColor: defaults.embedColor ?? null,
                    footerText: defaults.footerText ?? null,
                    enabled: false,
                    config: JSON.stringify(defaults),
                },
            }).catch(() => null);
            if (!panel) panel = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType } } }).catch(() => null);
        }
        if (panel) {
            try { panel.parsedConfig = JSON.parse(panel.config ?? "{}"); } catch { panel.parsedConfig = {}; }
        }
        return panel;
    }

    async list(guildId) {
        const panels = await this.prisma.panel.findMany({ where: { guildId } }).catch(() => []);
        for (const p of panels) try { p.parsedConfig = JSON.parse(p.config ?? "{}"); } catch { p.parsedConfig = {}; }
        // Ensure all types exist
        for (const t of Object.values(PANEL_TYPES)) if (!panels.find((p) => p.panelType === t)) {
            const created = await this.get(guildId, t);
            if (created) panels.push(created);
        }
        return panels;
    }

    async upsert(guildId, panelType, data) {
        const existing = await this.prisma.panel.findUnique({ where: { guildId_panelType: { guildId, panelType } } }).catch(() => null);
        const configStr = data.config ? (typeof data.config === "string" ? data.config : JSON.stringify(data.config)) : undefined;
        const payload = { ...data };
        if (configStr) payload.config = configStr;
        delete payload.guildId; delete payload.panelType;
        if (existing) return this.prisma.panel.update({ where: { guildId_panelType: { guildId, panelType } }, data: payload });
        return this.prisma.panel.create({ data: { guildId, panelType, ...payload } });
    }

    // Smart discovery
    normalize(name) { return name.toLowerCase().trim().replace(/[_]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-"); }
    findChannel(guild, candidates) {
        const norms = candidates.map((c) => this.normalize(c));
        for (const cand of norms) for (const ch of guild.channels.cache.values()) if (ch.type === ChannelType.GuildText && this.normalize(ch.name) === cand) return ch;
        return null;
    }
    findCategory(guild, candidates) {
        const norms = candidates.map((c) => c.toLowerCase().trim());
        for (const cand of norms) for (const ch of guild.channels.cache.values()) if (ch.type === ChannelType.GuildCategory && ch.name.toLowerCase().trim() === cand) return ch;
        return null;
    }

    // Renderer — aesthetic, restrained
    buildPanelEmbed(panel, ticketTypes = []) {
        const cfg = panel.parsedConfig ?? (panel.config ? JSON.parse(panel.config) : {}) ?? {};
        const title = panel.title ?? cfg.title ?? PANEL_META[panel.panelType]?.defaultTitle ?? panel.panelType;
        let description = panel.description ?? cfg.description ?? "";
        // Add subtle instruction for order/assistance if dropdown exists
        if ([PANEL_TYPES.ORDER, PANEL_TYPES.ASSISTANCE].includes(panel.panelType)) {
            const hasOptions = (ticketTypes && ticketTypes.length) || this.getFallbackTicketTypes(panel.panelType).length;
            if (hasOptions && !description.includes("Select an option")) {
                description = description ? `${description}\n\nSelect an option below to begin.` : `Select an option below to begin.`;
            }
        }
        const color = panel.embedColor ?? cfg.embedColor ?? Theme.panel;
        const sections = cfg.sections ?? [];
        // Build fields with airy spacing — keep titles short, content breathable
        const fields = sections.map((s) => {
            const name = (s.title ?? "—").trim();
            let value = (s.content ?? s.rules?.join("\n") ?? "—").trim();
            if (value.length > 1024) value = value.slice(0, 1021) + "…";
            // Ensure bullet lists are not cramped
            return { name, value, inline: false };
        }).slice(0, 25);

        const guildName = panel.guildId ? `${Brand.name} • ${PANEL_META[panel.panelType]?.label ?? panel.panelType}` : Brand.name;
        const embed = embeds.panel(title, description || undefined, fields.length ? fields : undefined, {
            author: { name: guildName },
            footer: panel.footerText ?? cfg.footerText ?? `${Brand.name}`,
            footerIcon: panel.footerIcon ?? cfg.footerIcon ?? undefined,
        });
        if (color) embed.setColor(color);
        // Banner — large, cinematic
        const banner = panel.bannerUrl ?? cfg.bannerUrl ?? null;
        if (banner) embed.setImage(banner);
        if (panel.thumbnailUrl || cfg.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl ?? cfg.thumbnailUrl);
        return embed;
    }

    // Fallback defaults so dropdown always shows even before any TicketType rows exist
    getFallbackTicketTypes(panelType) {
        if (panelType === PANEL_TYPES.ORDER) return [
            { key: "uniform", displayName: "Uniform", description: "Apparel / clothing designs", emoji: "👕", enabled: true },
            { key: "livery", displayName: "Livery", description: "Vehicle wraps & liveries", emoji: "🚗", enabled: true },
            { key: "gfx", displayName: "Graphics / GFX", description: "Banners, logos, gfx", emoji: "🎨", enabled: true },
            { key: "botdev", displayName: "Bot Development", description: "Custom bot / tooling", emoji: "💻", enabled: true },
            { key: "other", displayName: "Other", description: "Something else", emoji: "📦", enabled: true },
        ];
        if (panelType === PANEL_TYPES.ASSISTANCE) return [
            { key: "general", displayName: "General Support", description: "General help", emoji: "🛠️", enabled: true },
            { key: "staff", displayName: "Staff Assistance", description: "Contact staff", emoji: "👤", enabled: true },
            { key: "designer_app", displayName: "Designer Application", description: "Apply as designer", emoji: "🎨", enabled: true },
            { key: "report_designer", displayName: "Report a Designer", description: "Report issues", emoji: "⚠️", enabled: true },
            { key: "report_member", displayName: "Report a Member", description: "Report a user", emoji: "🚨", enabled: true },
            { key: "other", displayName: "Other", description: "Other request", emoji: "❓", enabled: true },
        ];
        return [];
    }

    async ensureDefaultTicketTypes(guildId, panelType) {
        const existing = await this.prisma.ticketType.findMany({ where: { guildId, panelType } }).catch(() => []);
        if (existing.length) return existing;
        const fallbacks = this.getFallbackTicketTypes(panelType);
        if (!fallbacks.length) return [];
        const created = [];
        for (const f of fallbacks) {
            try {
                const row = await this.prisma.ticketType.create({ data: { guildId, panelType, key: f.key, displayName: f.displayName, description: f.description, emoji: f.emoji, enabled: true, channelPrefix: f.key.slice(0,10) } });
                created.push(row);
            } catch {}
        }
        return created.length ? created : fallbacks;
    }

    buildPanelComponents(panel, ticketTypes = []) {
        const cfg = panel.parsedConfig ?? {};
        const rows = [];
        // Primary dropdown for ticket types (if any) — always show fallback so panel never appears without dropdown
        if ([PANEL_TYPES.ORDER, PANEL_TYPES.ASSISTANCE].includes(panel.panelType)) {
            let types = ticketTypes.filter((t) => t.enabled);
            if (!types.length) types = this.getFallbackTicketTypes(panel.panelType);
            const options = types.slice(0, 25).map((t) => ({
                label: String(t.displayName).slice(0, 100),
                value: String(t.key).slice(0, 100),
                description: (t.description ?? "").slice(0, 100) || undefined,
                emoji: t.emoji ?? undefined,
            }));
            if (options.length) {
                const placeholder = cfg.dropdownPlaceholder ?? (panel.panelType === PANEL_TYPES.ORDER ? "Choose a service to order" : "Choose a request");
                const menu = new StringSelectMenuBuilder().setCustomId(`panel:select:${panel.panelType}`).setPlaceholder(placeholder.slice(0,150)).addOptions(options);
                rows.push(new ActionRowBuilder().addComponents(menu));
            }
        }
        // Dashboard dropdown
        if (panel.panelType === PANEL_TYPES.DASHBOARD) {
            const opts = cfg.dropdownOptions ?? DEFAULT_PANELS.DASHBOARD.dropdownOptions ?? [];
            if (opts.length) {
                const menu = new StringSelectMenuBuilder().setCustomId(`panel:dashboard:${panel.guildId}`).setPlaceholder(cfg.dropdownPlaceholder ?? "More Information").addOptions(opts.slice(0,25).map((o)=>({label:o.label.slice(0,100), value:o.value.slice(0,100), description:o.description?.slice(0,100)})));
                rows.push(new ActionRowBuilder().addComponents(menu));
            }
        }
        // Regulations may have no dropdown
        return rows;
    }

    // Banner handling per panel
    async setBanner(guild, panelType, url, channelId = null, messageId = null) {
        return this.upsert(guild.id, panelType, { bannerUrl: url, bannerChannelId: channelId, bannerMessageId: messageId });
    }
    async removeBanner(guild, panelType) {
        return this.upsert(guild.id, panelType, { bannerUrl: null, bannerChannelId: null, bannerMessageId: null });
    }
    async validateBanner(guild, panel) {
        if (!panel.bannerUrl) return { ok: true, status: "none" };
        if (panel.bannerChannelId && panel.bannerMessageId) {
            const ch = guild.channels.cache.get(panel.bannerChannelId) ?? await guild.channels.fetch(panel.bannerChannelId).catch(()=>null);
            if (!ch) return { ok:false, status:"missing_channel" };
            const msg = await ch.messages.fetch(panel.bannerMessageId).catch(()=>null);
            if (!msg) return { ok:false, status:"missing_message" };
        }
        try {
            const res = await fetch(panel.bannerUrl, { method:"HEAD" }).catch(()=>null);
            if (res && res.status===404) return { ok:false, status:"404" };
        } catch {}
        return { ok:true, status:"ok" };
    }

    // Deployment
    async deploy(guild, panelType) {
        const panel = await this.get(guild.id, panelType);
        if (!panel) throw new Error("Panel not found");
        // Find channel
        let channel = null;
        if (panel.channelId) channel = guild.channels.cache.get(panel.channelId) ?? await guild.channels.fetch(panel.channelId).catch(()=>null);
        if (!channel) {
            // Try discovery by panel meta default names
            const candidates = panelType===PANEL_TYPES.ORDER? ["orders","design-orders","commissions"] : panelType===PANEL_TYPES.ASSISTANCE? ["support","assistance","help"] : panelType===PANEL_TYPES.REGULATIONS? ["rules","regulations","info"] : ["dashboard","info"];
            channel = this.findChannel(guild, candidates);
            if (!channel && panel.channelId) return { ok:false, reason:"Configured channel deleted" };
            if (!channel) return { ok:false, reason:"No panel channel configured — set one in setup" };
        }
        if (channel.type !== ChannelType.GuildText) return { ok:false, reason:"Panel channel must be text" };
        const me = guild.members.me;
        if (!me?.permissionsIn(channel).has(PermissionFlagsBits.SendMessages) || !me.permissionsIn(channel).has(PermissionFlagsBits.EmbedLinks)) return { ok:false, reason:"Missing SendMessages/EmbedLinks in " + channel.name };

        // Build embed/components — seed defaults if missing so dropdown always appears
        let ticketTypes = [];
        if ([PANEL_TYPES.ORDER, PANEL_TYPES.ASSISTANCE].includes(panelType)) {
            ticketTypes = await this.prisma.ticketType.findMany({ where:{ guildId:guild.id, panelType } }).catch(()=>[]);
            if (!ticketTypes.length) {
                ticketTypes = await this.ensureDefaultTicketTypes(guild.id, panelType);
            }
        }
        const embed = this.buildPanelEmbed(panel, ticketTypes);
        const components = this.buildPanelComponents(panel, ticketTypes);

        // Banner failure handling: if banner 404, remove image but don't crash
        const bannerCheck = await this.validateBanner(guild, panel);
        if (!bannerCheck.ok) {
            embed.setImage(null);
        }

        // Try edit existing
        let msg = null;
        if (panel.messageId) msg = await channel.messages.fetch(panel.messageId).catch(()=>null);
        if (msg) {
            try {
                await msg.edit({ embeds:[embed], components });
                return { ok:true, action:"updated", channelId: channel.id, messageId: msg.id };
            } catch (e) {
                logger.error("panels","edit failed", e);
                // Fall through to create
            }
        }
        try {
            const sent = await channel.send({ embeds:[embed], components });
            await this.upsert(guild.id, panelType, { channelId: channel.id, messageId: sent.id, enabled:true });
            return { ok:true, action:"created", channelId: channel.id, messageId: sent.id };
        } catch (e) {
            logger.error("panels","send failed", e);
            return { ok:false, reason: String(e.message).slice(0,200) };
        }
    }

    async deployAll(guild) {
        const results = {};
        for (const t of Object.values(PANEL_TYPES)) {
            const panel = await this.get(guild.id, t);
            if (!panel.enabled) { results[t] = { ok:true, action:"skipped", reason:"disabled" }; continue; }
            results[t] = await this.deploy(guild, t);
        }
        return results;
    }

    async repair(guild) {
        const report = [];
        for (const t of Object.values(PANEL_TYPES)) {
            const panel = await this.get(guild.id, t);
            // Channel deleted?
            if (panel.channelId) {
                const ch = guild.channels.cache.get(panel.channelId) ?? await guild.channels.fetch(panel.channelId).catch(()=>null);
                if (!ch) {
                    const found = this.findChannel(guild, [PANEL_META[t].defaultChannel, t.toLowerCase()]);
                    if (found) {
                        await this.upsert(guild.id, t, { channelId: found.id });
                        report.push(`${t}: channel repaired → #${found.name}`);
                    } else report.push(`${t}: channel missing ${panel.channelId}`);
                }
            }
            // Message deleted?
            if (panel.messageId && panel.channelId) {
                const ch = guild.channels.cache.get(panel.channelId) ?? await guild.channels.fetch(panel.channelId).catch(()=>null);
                if (ch) {
                    const msg = await ch.messages.fetch(panel.messageId).catch(()=>null);
                    if (!msg) report.push(`${t}: message missing — will recreate on deploy`);
                }
            }
            // Banner missing?
            const bv = await this.validateBanner(guild, panel);
            if (!bv.ok) report.push(`${t}: banner unavailable (${bv.status})`);
        }
        return report;
    }
}
