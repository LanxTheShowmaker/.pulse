import {
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
    PermissionFlagsBits, MessageFlags, EmbedBuilder
} from "discord.js";
import { embeds, confirmationRow } from "../../design/embeds.js";
import { logger } from "../../core/logger.js";
import { Theme } from "../../design/theme.js";
import { PANEL_TYPES } from "../../services/panels.js";

const SESSIONS = new Map(); // `${guildId}:${userId}` -> { ownerId, guildId, expires, timeout }
const SESSION_TTL = 15 * 60 * 1000;

function getSession(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const s = SESSIONS.get(key);
    if (!s) return null;
    if (Date.now() > s.expires) { SESSIONS.delete(key); return null; }
    return s;
}
function setSession(guildId, userId, data = {}) {
    const key = `${guildId}:${userId}`;
    if (SESSIONS.has(key)) clearTimeout(SESSIONS.get(key).timeout);
    const expires = Date.now() + SESSION_TTL;
    const timeout = setTimeout(() => SESSIONS.delete(key), SESSION_TTL);
    // Don't prevent exit
    if (timeout.unref) timeout.unref();
    SESSIONS.set(key, { ownerId: userId, guildId, expires, timeout, ...data });
}
function clearSession(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const s = SESSIONS.get(key);
    if (s) clearTimeout(s.timeout);
    SESSIONS.delete(key);
}

function isOwner(interaction) {
    const s = getSession(interaction.guildId, interaction.user.id);
    if (!s) return false;
    // Also allow if interaction is from same user who owns the guild session (any guild session owned by this user)
    // For simplicity, check if there's any session for this guild owned by interaction.user
    const key = `${interaction.guildId}:${interaction.user.id}`;
    return SESSIONS.has(key);
}

async function buildStatusEmbed(guild, client) {
    const panels = await client.services.panels.list(guild.id);
    const types = await client.prisma.ticketType.findMany({ where: { guildId: guild.id } }).catch(() => []);
    const countByPanel = (t) => types.filter((x) => x.panelType === t).length;
    const statusFor = (panel) => {
        if (!panel.enabled) return "◯  Not configured";
        if (!panel.channelId || !panel.messageId) return "◐  Partial";
        const ch = guild.channels.cache.get(panel.channelId);
        if (!ch) return "⬤  Missing";
        return "⬤  Live";
    };
    const lines = [];
    for (const pt of Object.values(PANEL_TYPES)) {
        const p = panels.find((x) => x.panelType === pt);
        const label = pt === PANEL_TYPES.ORDER ? "Orders" : pt === PANEL_TYPES.ASSISTANCE ? "Assistance" : pt === PANEL_TYPES.REGULATIONS ? "Regulations" : "Dashboard";
        const emoji = pt === PANEL_TYPES.ORDER ? "🛒" : pt === PANEL_TYPES.ASSISTANCE ? "🛟" : pt === PANEL_TYPES.REGULATIONS ? "📜" : "📊";
        const st = p ? statusFor(p) : "◯  —";
        const extra = pt === PANEL_TYPES.ORDER || pt === PANEL_TYPES.ASSISTANCE ? ` ${countByPanel(pt)} types` : pt === PANEL_TYPES.REGULATIONS ? ` ${(() => { try { return JSON.parse(p?.config ?? "{}").sections?.length ?? 0; } catch { return 0; } })()} sections` : "";
        const chInfo = p?.channelId ? `<#${p.channelId}>` : "`—`";
        lines.push(`${emoji}  **${label}**  ${st}  ·  ${chInfo}${extra ? `  ·  _${extra.trim()}_` : ""}`);
    }
    const ticketEnabled = panels.some((p) => p.enabled);
    lines.push(`\n🎫  **Tickets**  ${ticketEnabled ? "⬤  Enabled" : "◯  Disabled"}     📄  **Transcripts**  ${(await client.services.settings.get(guild.id).catch(()=>null))?.logChannelId ? "⬤  Enabled" : "◯  Disabled"}`);

    const embed = embeds.panel("Ticket and Panel Manager", `Server configuration for panels, tickets, and support.\n\n${lines.join("\n")}`, [
        { name: "  Guild", value: `> **${guild.name}**`, inline: true },
        { name: "  Panels", value: `> **${panels.filter((p) => p.enabled).length}/4** live`, inline: true },
        { name: "  Tip", value: `> *Select a panel below to configure*`, inline: true },
    ], {
        author: { name: `${guild.name}`, iconURL: guild.iconURL({ size: 64 }) ?? undefined },
    });
    embed.setThumbnail(guild.iconURL({ size: 128 }) ?? null);
    return embed;
}

function dashboardComponents() {
    const panelMenu = new StringSelectMenuBuilder().setCustomId("pulse:setup:panelMenu").setPlaceholder("Configure a panel").addOptions([
        { label: "Orders", value: PANEL_TYPES.ORDER, emoji: "🛒", description: "Order panel & ticket types" },
        { label: "Assistance", value: PANEL_TYPES.ASSISTANCE, emoji: "🛟", description: "Assistance requests" },
        { label: "Regulations", value: PANEL_TYPES.REGULATIONS, emoji: "📜", description: "Rules & sections" },
        { label: "Dashboard", value: PANEL_TYPES.DASHBOARD, emoji: "📊", description: "Info hub" },
    ]);
    const row1 = new ActionRowBuilder().addComponents(panelMenu);
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("pulse:setup:ticketSettings").setLabel("Ticket Settings").setStyle(ButtonStyle.Secondary).setEmoji("🎫"),
        new ButtonBuilder().setCustomId("pulse:setup:globalSettings").setLabel("Global Settings").setStyle(ButtonStyle.Secondary).setEmoji("⚙️"),
        new ButtonBuilder().setCustomId("pulse:setup:preview").setLabel("Preview").setStyle(ButtonStyle.Secondary).setEmoji("👁️"),
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("pulse:setup:repair").setLabel("Repair").setStyle(ButtonStyle.Secondary).setEmoji("🔧"),
        new ButtonBuilder().setCustomId("pulse:setup:deploy").setLabel("Deploy").setStyle(ButtonStyle.Success).setEmoji("🚀"),
        new ButtonBuilder().setCustomId("pulse:setup:close").setLabel("Close").setStyle(ButtonStyle.Danger).setEmoji("❌"),
    );
    return [row1, row2, row3];
}

async function panelEditorEmbed(guild, panelType, client) {
    const panel = await client.services.panels.get(guild.id, panelType);
    const cfg = panel.parsedConfig ?? {};
    const bannerStatus = panel.bannerUrl ? "⬤  Set  •  preview below" : "◯  Not set";
    const channel = panel.channelId ? guild.channels.cache.get(panel.channelId) : null;
    const types = panelType === PANEL_TYPES.ORDER || panelType === PANEL_TYPES.ASSISTANCE ? await client.prisma.ticketType.findMany({ where: { guildId: guild.id, panelType } }).catch(() => []) : [];
    const meta = {
        [PANEL_TYPES.ORDER]: { title: "Orders", emoji: "🛒", desc: "Your storefront — where commissions begin" },
        [PANEL_TYPES.ASSISTANCE]: { title: "Assistance", emoji: "🛟", desc: "A haven for support and care" },
        [PANEL_TYPES.REGULATIONS]: { title: "Regulations", emoji: "📜", desc: "Your covenant of safety" },
        [PANEL_TYPES.DASHBOARD]: { title: "Dashboard", emoji: "📊", desc: "Your community's front door" },
    }[panelType];
    const embed = embeds.panel(`${meta.emoji}  ${meta.title}`, `${meta.desc}\nConfigure this panel for ${guild.name}.`, [
        { name: "  State", value: panel.enabled ? "```diff\n+ Live\n```" : "```diff\n- Disabled\n```", inline: true },
        { name: "  Channel", value: channel ? `<#${channel.id}>` : "`—  Not set`", inline: true },
        { name: "  Message", value: panel.messageId ? "`⬤  Deployed`" : "`◯  Awaiting deploy`", inline: true },
        { name: "  Title", value: `> ${panel.title ?? cfg.title ?? "—"}`, inline: false },
        { name: "  Banner", value: bannerStatus, inline: true },
        { name: "  Footer", value: `> ${(panel.footerText ?? cfg.footerText ?? "—").slice(0,100)}`, inline: true },
        ...(panelType === PANEL_TYPES.REGULATIONS ? [{ name: "  Sections", value: `> **${(cfg.sections ?? []).length}** sections`, inline: true }] : []),
        ...(types.length ? [{ name: "  Ticket Types", value: `> **${types.length}** configured`, inline: true }] : []),
    ], {
        author: { name: `${meta.title}`, iconURL: guild.iconURL({ size:64 }) ?? undefined },
        footer: `${guild.name}`,
    });
    if (panel.bannerUrl) embed.setImage(panel.bannerUrl);
    embed.setThumbnail(guild.iconURL({ size:128 }) ?? null);
    return embed;
}

function panelEditorComponents(panelType) {
    const channelRow = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`pulse:setup:panelChannel:${panelType}`).setPlaceholder("Select panel channel").addChannelTypes(ChannelType.GuildText));
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pulse:setup:editTitle:${panelType}`).setLabel("Title").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pulse:setup:editDesc:${panelType}`).setLabel("Description").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pulse:setup:toggleEnabled:${panelType}`).setLabel("Toggle Enabled").setStyle(ButtonStyle.Primary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pulse:setup:bannerUpload:${panelType}`).setLabel("Upload Banner").setStyle(ButtonStyle.Secondary).setEmoji("🖼️"),
        new ButtonBuilder().setCustomId(`pulse:setup:bannerUrl:${panelType}`).setLabel("Banner URL").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pulse:setup:bannerRemove:${panelType}`).setLabel("Remove Banner").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`pulse:setup:bannerPreview:${panelType}`).setLabel("Preview Banner").setStyle(ButtonStyle.Secondary).setEmoji("👁️"),
    );
    const row3 = new ActionRowBuilder();
    if (panelType === PANEL_TYPES.ORDER || panelType === PANEL_TYPES.ASSISTANCE) {
        row3.addComponents(new ButtonBuilder().setCustomId(`pulse:setup:manageTypes:${panelType}`).setLabel("Ticket Types").setStyle(ButtonStyle.Primary).setEmoji("🎫"));
    } else if (panelType === PANEL_TYPES.REGULATIONS) {
        row3.addComponents(new ButtonBuilder().setCustomId(`pulse:setup:manageRegs:${panelType}`).setLabel("Sections").setStyle(ButtonStyle.Primary).setEmoji("📜"));
    } else {
        row3.addComponents(new ButtonBuilder().setCustomId(`pulse:setup:editSections:${panelType}`).setLabel("Edit Sections").setStyle(ButtonStyle.Primary));
    }
    row3.addComponents(new ButtonBuilder().setCustomId(`pulse:setup:previewPanel:${panelType}`).setLabel("Preview").setStyle(ButtonStyle.Secondary).setEmoji("👁️"));
    row3.addComponents(new ButtonBuilder().setCustomId(`pulse:setup:deployPanel:${panelType}`).setLabel("Deploy").setStyle(ButtonStyle.Success).setEmoji("🚀"));
    const row4 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary));
    return [channelRow, row1, row2, row3, row4];
}

export default {
    data: new SlashCommandBuilder().setName("setuptickets").setDescription("Configure panels and ticket systems.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: "Config",
    async execute(interaction) {
        const client = interaction.client;
        const member = interaction.member;
        const guild = interaction.guild;
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ embeds: [embeds.error("Missing permission", "You need **Manage Server** to configure tickets.")], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        setSession(guild.id, interaction.user.id, {});

        // Register global handlers once per execution (overwrite for this guild session)
        const ensureOwner = async (i) => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ embeds: [embeds.error("Not your session", "You cannot use this setup session.")], flags: MessageFlags.Ephemeral }).catch(() => {});
                return false;
            }
            return true;
        };

        // Panel menu
        client.components.set("pulse:setup:panelMenu", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.values[0];
            const embed = await panelEditorEmbed(i.guild, panelType, client);
            await i.update({ embeds: [embed], components: panelEditorComponents(panelType) }).catch(() => {});
        });

        // Back to dashboard
        client.components.set("pulse:setup:back", async (i) => {
            if (!await ensureOwner(i)) return;
            const embed = await buildStatusEmbed(i.guild, client);
            await i.update({ embeds: [embed], components: dashboardComponents() }).catch(() => {});
        });

        // Channel select
        client.components.set("pulse:setup:panelChannel", async (i) => {
            if (!await ensureOwner(i)) return;
            if (!i.isChannelSelectMenu()) return;
            const panelType = i.customId.split(":")[3];
            const chId = i.values[0];
            await client.services.panels.upsert(i.guild.id, panelType, { channelId: chId });
            const embed = await panelEditorEmbed(i.guild, panelType, client);
            await i.update({ embeds: [embed], components: panelEditorComponents(panelType) }).catch(() => {});
        });

        // Edit Title
        client.components.set("pulse:setup:editTitle", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const panel = await client.services.panels.get(i.guild.id, panelType);
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalTitle:${panelType}`).setTitle("Edit Title");
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(true).setValue(panel.title ?? "")));
            await i.showModal(modal).catch(() => {});
        });
        client.components.set("pulse:setup:modalTitle", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return i.reply({ embeds: [embeds.error("Not your session","")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            const panelType = i.customId.split(":")[3];
            const title = i.fields.getTextInputValue("title");
            await client.services.panels.upsert(i.guild.id, panelType, { title });
            const embed = await panelEditorEmbed(i.guild, panelType, client);
            await i.reply({ embeds: [embeds.success("Updated","Title saved")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            // Update original message if possible
            try { const msg = await i.channel.messages.fetch(i.message?.id ?? "").catch(()=>null); } catch {}
        });

        // Edit Description
        client.components.set("pulse:setup:editDesc", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const panel = await client.services.panels.get(i.guild.id, panelType);
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalDesc:${panelType}`).setTitle("Edit Description");
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("desc").setLabel("Description").setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(false).setValue(panel.description ?? "")));
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalDesc", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const panelType = i.customId.split(":")[3];
            const desc = i.fields.getTextInputValue("desc");
            await client.services.panels.upsert(i.guild.id, panelType, { description: desc });
            await i.reply({ embeds:[embeds.success("Updated","Description saved")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });

        // Toggle enabled
        client.components.set("pulse:setup:toggleEnabled", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const panel = await client.services.panels.get(i.guild.id, panelType);
            await client.services.panels.upsert(i.guild.id, panelType, { enabled: !panel.enabled });
            const embed = await panelEditorEmbed(i.guild, panelType, client);
            await i.update({ embeds:[embed], components: panelEditorComponents(panelType) }).catch(()=>{});
        });

        // Banner URL
        client.components.set("pulse:setup:bannerUrl", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalBannerUrl:${panelType}`).setTitle("Banner URL");
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("url").setLabel("Image URL (https)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("https://cdn.discordapp.com/.../banner.png")));
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalBannerUrl", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const panelType = i.customId.split(":")[3];
            const url = i.fields.getTextInputValue("url");
            try {
                const persisted = await client.services.assets.persistUrl(i.guild, url);
                await client.services.panels.setBanner(i.guild, panelType, persisted.url, persisted.channelId, persisted.messageId);
                await i.reply({ embeds:[embeds.success("Banner set",`Stored: ${persisted.url}`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
            } catch (e) {
                await i.reply({ embeds:[embeds.error("Banner failed", String(e.message).slice(0,200))], flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        });

        // Banner upload
        client.components.set("pulse:setup:bannerUpload", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            await i.reply({ embeds:[embeds.info("Upload Banner", "Please **upload an image attachment** in this channel within 60 seconds. I'll store it in `pulse-assets`.")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            const filter = (m) => m.author.id === i.user.id && m.attachments.size > 0;
            const collector = i.channel.createMessageCollector({ filter, time: 60_000, max: 1 });
            collector.on("collect", async (m) => {
                const att = m.attachments.first();
                try {
                    const persisted = await client.services.assets.persistAttachment(i.guild, att);
                    await client.services.panels.setBanner(i.guild, panelType, persisted.url, persisted.channelId, persisted.messageId);
                    await m.reply({ embeds:[embeds.success("Banner uploaded", `Saved for **${panelType}**: ${persisted.url}`)] }).catch(()=>{});
                    await m.delete().catch(()=>{});
                } catch (e) {
                    await m.reply({ embeds:[embeds.error("Upload failed", String(e.message).slice(0,200))] }).catch(()=>{});
                }
            });
            collector.on("end", (collected) => {
                if (collected.size===0) i.followUp({ embeds:[embeds.warn("Timed out","No image uploaded")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            });
        });

        // Remove banner
        client.components.set("pulse:setup:bannerRemove", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            await client.services.panels.removeBanner(i.guild, panelType);
            const embed = await panelEditorEmbed(i.guild, panelType, client);
            await i.update({ embeds:[embed], components: panelEditorComponents(panelType) }).catch(()=>{});
        });
        // Preview banner
        client.components.set("pulse:setup:bannerPreview", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const panel = await client.services.panels.get(i.guild.id, panelType);
            if (!panel.bannerUrl) return i.reply({ embeds:[embeds.warn("No banner","No banner set")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            const embed = new EmbedBuilder().setTitle(`Preview — ${panelType}`).setImage(panel.bannerUrl).setColor(Theme.accent);
            await i.reply({ embeds:[embed], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });

        // Manage ticket types
        client.components.set("pulse:setup:manageTypes", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const types = await client.prisma.ticketType.findMany({ where:{ guildId:i.guild.id, panelType } }).catch(()=>[]);
            const embed = embeds.info(`${panelType} Ticket Types`, types.length ? types.map((t)=> `${t.emoji ?? "•"} **${t.displayName}** (\`${t.key}\`) ${t.enabled?"🟢":"🔴"}`).join("\n") : "No ticket types yet. Create one.", []);
            const opts = types.slice(0,25).map((t)=>({ label:t.displayName.slice(0,100), value:t.id, description:`${t.key}`.slice(0,100) }));
            const rows = [];
            if (opts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`pulse:setup:typeSelect:${panelType}`).setPlaceholder("Select type to edit").addOptions(opts)));
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pulse:setup:createType:${panelType}`).setLabel("Create Type").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary)
            ));
            await i.update({ embeds:[embed], components: rows }).catch(()=>{});
        });
        client.components.set("pulse:setup:createType", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalCreateType:${panelType}`).setTitle("Create Ticket Type");
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("key").setLabel("Internal key (no spaces)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setPlaceholder("uniform")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Display name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder("Uniform")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emoji").setLabel("Emoji").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder("👕")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("desc").setLabel("Description").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder("Brand / server logos")),
            );
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalCreateType", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const panelType = i.customId.split(":")[3];
            const key = i.fields.getTextInputValue("key").toLowerCase().replace(/[^a-z0-9_-]+/g,"-").slice(0,32);
            const name = i.fields.getTextInputValue("name");
            const emoji = i.fields.getTextInputValue("emoji") || null;
            const desc = i.fields.getTextInputValue("desc") || null;
            try {
                await client.prisma.ticketType.create({ data:{ guildId:i.guild.id, panelType, key, displayName:name, emoji, description:desc } });
                await i.reply({ embeds:[embeds.success("Created",`Type **${name}** (\`${key}\`) created`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
            } catch (e) {
                const msg = e.code==="P2002" ? "Key already exists" : String(e.message).slice(0,200);
                await i.reply({ embeds:[embeds.error("Failed",msg)], flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        });
        client.components.set("pulse:setup:typeSelect", async (i) => {
            if (!await ensureOwner(i)) return;
            if (!i.isStringSelectMenu()) return;
            const panelType = i.customId.split(":")[3];
            const typeId = i.values[0];
            const type = await client.prisma.ticketType.findUnique({ where:{ id:typeId } }).catch(()=>null);
            if (!type) return i.reply({ embeds:[embeds.error("Not found","")] , flags: MessageFlags.Ephemeral }).catch(()=>{});
            const embed = embeds.info(`Edit ${type.displayName}`, `Key: \`${type.key}\`\nEmoji: ${type.emoji??"—"}\nEnabled: ${type.enabled?"Yes":"No"}`, [
                { name:"Category", value: type.categoryId ? `<#${type.categoryId}>` : "Auto" },
                { name:"Prefix", value: type.channelPrefix ?? "ticket" },
                { name:"Priority", value: type.priority },
                { name:"Questions", value: (()=>{ try{ return JSON.parse(type.questions ?? "[]").length + " questions"; }catch{ return "0"; }})() },
            ]);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pulse:setup:editType:${typeId}`).setLabel("Edit").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`pulse:setup:deleteType:${typeId}`).setLabel("Delete").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pulse:setup:editQuestions:${typeId}`).setLabel("Questions").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary),
            );
            await i.update({ embeds:[embed], components:[row] }).catch(()=>{});
        });
        client.components.set("pulse:setup:deleteType", async (i) => {
            if (!await ensureOwner(i)) return;
            const typeId = i.customId.split(":")[3];
            const type = await client.prisma.ticketType.findUnique({ where:{ id:typeId } }).catch(()=>null);
            if (!type) return;
            await i.reply({ embeds:[embeds.warn("Delete?",`Delete **${type.displayName}**?`)], components:[confirmationRow({ acceptCustomId:`pulse:setup:confirmDeleteType:${typeId}`, cancelCustomId:`pulse:setup:cancelDeleteType:${typeId}`, danger:true })], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:confirmDeleteType", async (i) => {
            if (i.user.id !== interaction.user.id) return;
            const typeId = i.customId.split(":")[3];
            await client.prisma.ticketType.delete({ where:{ id:typeId } }).catch(()=>{});
            await i.update({ embeds:[embeds.success("Deleted","Type deleted")], components:[] }).catch(()=>{});
        });
        client.components.set("pulse:setup:cancelDeleteType", async (i) => { await i.update({ embeds:[embeds.info("Cancelled","")], components:[] }).catch(()=>{}); });
        client.components.set("pulse:setup:editType", async (i) => {
            if (!await ensureOwner(i)) return;
            const typeId = i.customId.split(":")[3];
            const type = await client.prisma.ticketType.findUnique({ where:{ id:typeId } }).catch(()=>null);
            if (!type) return;
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalEditType:${typeId}`).setTitle("Edit Type");
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Display name").setStyle(TextInputStyle.Short).setRequired(true).setValue(type.displayName).setMaxLength(100)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("desc").setLabel("Description").setStyle(TextInputStyle.Short).setRequired(false).setValue(type.description??"").setMaxLength(100)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emoji").setLabel("Emoji").setStyle(TextInputStyle.Short).setRequired(false).setValue(type.emoji??"").setMaxLength(10)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("prefix").setLabel("Channel prefix").setStyle(TextInputStyle.Short).setRequired(false).setValue(type.channelPrefix??"ticket").setMaxLength(20)),
            );
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalEditType", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const typeId = i.customId.split(":")[3];
            const name = i.fields.getTextInputValue("name");
            const desc = i.fields.getTextInputValue("desc");
            const emoji = i.fields.getTextInputValue("emoji");
            const prefix = i.fields.getTextInputValue("prefix");
            await client.prisma.ticketType.update({ where:{ id:typeId }, data:{ displayName:name, description:desc||null, emoji:emoji||null, channelPrefix:prefix||"ticket" } }).catch(()=>{});
            await i.reply({ embeds:[embeds.success("Updated","Saved")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        // Questions editor
        client.components.set("pulse:setup:editQuestions", async (i) => {
            if (!await ensureOwner(i)) return;
            const typeId = i.customId.split(":")[3];
            const type = await client.prisma.ticketType.findUnique({ where:{ id:typeId } }).catch(()=>null);
            let qs=[]; try{ qs=JSON.parse(type.questions??"[]"); }catch{}
            const embed = embeds.info("Questions", qs.length? qs.map((q,idx)=> `${idx+1}. ${q.label??q.question} ${q.required===false?"(optional)":""}`).join("\n") : "No questions. Add up to 5.");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pulse:setup:addQuestion:${typeId}`).setLabel("Add").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pulse:setup:clearQuestions:${typeId}`).setLabel("Clear").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary),
            );
            await i.update({ embeds:[embed], components:[row] }).catch(()=>{});
        });
        client.components.set("pulse:setup:addQuestion", async (i) => {
            if (!await ensureOwner(i)) return;
            const typeId = i.customId.split(":")[3];
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalAddQ:${typeId}`).setTitle("Add Question");
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("label").setLabel("Question").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45).setPlaceholder("What are you ordering?")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("placeholder").setLabel("Placeholder").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
            );
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalAddQ", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const typeId = i.customId.split(":")[3];
            const type = await client.prisma.ticketType.findUnique({ where:{ id:typeId } }).catch(()=>null);
            let qs=[]; try{ qs=JSON.parse(type.questions??"[]"); }catch{}
            if (qs.length>=5) return i.reply({ embeds:[embeds.warn("Limit","Max 5 questions")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            qs.push({ label: i.fields.getTextInputValue("label"), placeholder: i.fields.getTextInputValue("placeholder")||"", required:true, style:"SHORT" });
            await client.prisma.ticketType.update({ where:{ id:typeId }, data:{ questions: JSON.stringify(qs) } }).catch(()=>{});
            await i.reply({ embeds:[embeds.success("Added","Question added")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:clearQuestions", async (i) => {
            if (!await ensureOwner(i)) return;
            const typeId = i.customId.split(":")[3];
            await client.prisma.ticketType.update({ where:{ id:typeId }, data:{ questions:"[]" } }).catch(()=>{});
            await i.update({ embeds:[embeds.success("Cleared","Questions cleared")], components:[] }).catch(()=>{});
        });

        // Regulations editor (sections stored in Panel.config.sections)
        client.components.set("pulse:setup:manageRegs", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const panel = await client.services.panels.get(i.guild.id, panelType);
            const cfg = panel.parsedConfig ?? {};
            const sections = cfg.sections ?? [];
            const embed = embeds.info("Regulations Sections", sections.length? sections.map((s,idx)=> `**${idx+1}. ${s.title}** — ${(s.content??"").slice(0,60)}`).join("\n") : "No sections.", []);
            const opts = sections.slice(0,25).map((s,idx)=>({ label:s.title.slice(0,100), value:String(idx), description:`Section ${idx+1}`.slice(0,100) }));
            const rows=[];
            if (opts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`pulse:setup:regSelect:${panelType}`).setPlaceholder("Select section to edit").addOptions(opts)));
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pulse:setup:regCreate:${panelType}`).setLabel("Create Section").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary)
            ));
            await i.update({ embeds:[embed], components: rows }).catch(()=>{});
        });
        client.components.set("pulse:setup:regCreate", async (i) => {
            if (!await ensureOwner(i)) return;
            const panelType = i.customId.split(":")[3];
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalRegCreate:${panelType}`).setTitle("Create Section");
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Section title").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("content").setLabel("Rules (one per line)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)),
            );
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalRegCreate", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const panelType = i.customId.split(":")[3];
            const panel = await client.services.panels.get(i.guild.id, panelType);
            const cfg = panel.parsedConfig ?? {}; const sections = cfg.sections ?? [];
            sections.push({ title:i.fields.getTextInputValue("title"), content: i.fields.getTextInputValue("content") });
            await client.services.panels.upsert(i.guild.id, panelType, { config: JSON.stringify({ ...cfg, sections }) });
            await i.reply({ embeds:[embeds.success("Created","Section added")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:regSelect", async (i) => {
            if (!await ensureOwner(i)) return;
            if (!i.isStringSelectMenu()) return;
            const panelType = i.customId.split(":")[3];
            const idx = Number(i.values[0]);
            const panel = await client.services.panels.get(i.guild.id, panelType);
            const sec = (panel.parsedConfig?.sections ?? [])[idx];
            if (!sec) return;
            const embed = embeds.info(sec.title, sec.content.slice(0,4000));
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pulse:setup:regEdit:${panelType}:${idx}`).setLabel("Edit").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`pulse:setup:regDelete:${panelType}:${idx}`).setLabel("Delete").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary),
            );
            await i.update({ embeds:[embed], components:[row] }).catch(()=>{});
        });
        client.components.set("pulse:setup:regEdit", async (i) => {
            if (!await ensureOwner(i)) return;
            const [_,panelType,idxStr] = i.customId.split(":").slice(3); // pulse:setup:regEdit:REGULATIONS:0 -> need split correctly
            // customId is pulse:setup:regEdit:REGULATIONS:0
            const parts = i.customId.split(":");
            const pt = parts[3]; const idx = Number(parts[4]);
            const panel = await client.services.panels.get(i.guild.id, pt);
            const sec = (panel.parsedConfig?.sections ?? [])[idx];
            const modal = new ModalBuilder().setCustomId(`pulse:setup:modalRegEdit:${pt}:${idx}`).setTitle("Edit Section");
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setRequired(true).setValue(sec.title).setMaxLength(100)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("content").setLabel("Content").setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(sec.content).setMaxLength(4000)),
            );
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:setup:modalRegEdit", async (i) => {
            if (!i.isModalSubmit()) return;
            if (i.user.id !== interaction.user.id) return;
            const parts = i.customId.split(":"); const pt=parts[3]; const idx=Number(parts[4]);
            const panel = await client.services.panels.get(i.guild.id, pt);
            const cfg = panel.parsedConfig ?? {}; const sections = cfg.sections ?? [];
            sections[idx] = { title:i.fields.getTextInputValue("title"), content:i.fields.getTextInputValue("content") };
            await client.services.panels.upsert(i.guild.id, pt, { config: JSON.stringify({ ...cfg, sections }) });
            await i.reply({ embeds:[embeds.success("Updated","Section saved")], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:regDelete", async (i) => {
            if (!await ensureOwner(i)) return;
            const parts = i.customId.split(":"); const pt=parts[3]; const idx=Number(parts[4]);
            await i.reply({ embeds:[embeds.warn("Delete?","Confirm delete")], components:[confirmationRow({ acceptCustomId:`pulse:setup:regConfirmDel:${pt}:${idx}`, cancelCustomId:`pulse:setup:regCancelDel:${pt}:${idx}`, danger:true })], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:regConfirmDel", async (i) => {
            if (i.user.id !== interaction.user.id) return;
            const parts=i.customId.split(":"); const pt=parts[3]; const idx=Number(parts[4]);
            const panel=await client.services.panels.get(i.guild.id, pt);
            const cfg=panel.parsedConfig??{}; const sections=cfg.sections??[];
            sections.splice(idx,1);
            await client.services.panels.upsert(i.guild.id, pt, { config: JSON.stringify({...cfg, sections}) });
            await i.update({ embeds:[embeds.success("Deleted","Section removed")], components:[] }).catch(()=>{});
        });
        client.components.set("pulse:setup:regCancelDel", async (i)=>{ await i.update({ embeds:[embeds.info("Cancelled","")], components:[] }).catch(()=>{}); });

        // Ticket / Global settings stubs
        client.components.set("pulse:setup:ticketSettings", async (i) => {
            if (!await ensureOwner(i)) return;
            const embed = embeds.info("Ticket Settings", "Configure ticket categories, cooldowns, max open tickets per panel. Use panel Ticket Types to set category per type.", [
                { name:"Categories", value:"Set per Ticket Type via Ticket Types" },
                { name:"Cooldown", value:"Set per type (seconds)" },
                { name:"Max Open", value:"Set per type" },
            ]);
            await i.update({ embeds:[embed], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(()=>{});
        });
        client.components.set("pulse:setup:globalSettings", async (i) => {
            if (!await ensureOwner(i)) return;
            const embed = embeds.info("Global Panel Branding", "Configure embed color, footer, thumbnail via each panel's settings. Global branding coming soon.", []);
            await i.update({ embeds:[embed], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(()=>{});
        });

        // Preview / Repair / Deploy
        const validatePerms = (guild) => {
            const me = guild.members.me;
            const warnings=[];
            if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) warnings.push("Manage Channels");
            if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) warnings.push("Manage Roles");
            if (!me?.permissions.has(PermissionFlagsBits.SendMessages)) warnings.push("Send Messages");
            if (!me?.permissions.has(PermissionFlagsBits.EmbedLinks)) warnings.push("Embed Links");
            return warnings;
        };
        client.components.set("pulse:setup:preview", async (i) => {
            if (!await ensureOwner(i)) return;
            const panels = await client.services.panels.list(i.guild.id);
            const previews = [];
            for (const p of panels) {
                if (!p.enabled) continue;
                const types = await client.prisma.ticketType.findMany({ where:{ guildId:i.guild.id, panelType:p.panelType } }).catch(()=>[]);
                const embed = client.services.panels.buildPanelEmbed(p, types);
                previews.push(embed);
            }
            if (!previews.length) return i.reply({ embeds:[embeds.warn("Nothing to preview","Enable at least one panel")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            await i.reply({ embeds: previews.slice(0,10), flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:previewPanel", async (i) => {
            if (!await ensureOwner(i)) return;
            const pt = i.customId.split(":")[3];
            const p = await client.services.panels.get(i.guild.id, pt);
            const types = await client.prisma.ticketType.findMany({ where:{ guildId:i.guild.id, panelType:pt } }).catch(()=>[]);
            const embed = client.services.panels.buildPanelEmbed(p, types);
            await i.reply({ embeds:[embed], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:setup:deployPanel", async (i) => {
            if (!await ensureOwner(i)) return;
            await i.deferUpdate().catch(()=>{});
            const pt = i.customId.split(":")[3];
            const warn = validatePerms(i.guild);
            if (warn.length) return i.editReply({ embeds:[embeds.error("Missing perms", warn.join(", "))], components:[] }).catch(()=>{});
            const res = await client.services.panels.deploy(i.guild, pt);
            if (res.ok) await i.editReply({ embeds:[embeds.success("Deployed",`${pt} ${res.action} in <#${res.channelId}>`)], components:[] }).catch(()=>{});
            else await i.editReply({ embeds:[embeds.error("Deploy failed", res.reason)], components:[] }).catch(()=>{});
        });
        client.components.set("pulse:setup:deploy", async (i) => {
            if (!await ensureOwner(i)) return;
            await i.deferUpdate().catch(()=>{});
            const warn = validatePerms(i.guild);
            if (warn.length) return i.editReply({ embeds:[embeds.error("Missing perms", warn.join(", "))], components:[] }).catch(()=>{});
            const results = await client.services.panels.deployAll(i.guild);
            const lines = Object.entries(results).map(([k,v])=> `${k}: ${v.ok ? (v.action==="skipped"?"— skipped":`✓ ${v.action} <#${v.channelId}>`) : `✗ ${v.reason}` }`);
            await i.editReply({ embeds:[embeds.success("Setup complete.","Panels deployment results", [{name:"PANELS", value: lines.join("\n")}])], components:[] }).catch(()=>{});
        });
        client.components.set("pulse:setup:repair", async (i) => {
            if (!await ensureOwner(i)) return;
            await i.deferUpdate().catch(()=>{});
            const report = await client.services.panels.repair(i.guild);
            const info = report.length? report.join("\n") : "No repairs needed — all resources healthy.";
            await i.editReply({ embeds:[embeds.info("Repair Report", info)], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("pulse:setup:back").setLabel("Back").setStyle(ButtonStyle.Secondary))] }).catch(()=>{});
        });
        client.components.set("pulse:setup:close", async (i) => {
            if (!await ensureOwner(i)) return;
            clearSession(i.guild.id, i.user.id);
            await i.update({ embeds:[embeds.info("Closed","Setup closed")], components:[] }).catch(()=>{});
        });

        const embed = await buildStatusEmbed(guild, client);
        await interaction.editReply({ embeds:[embed], components: dashboardComponents() });
    },
};
