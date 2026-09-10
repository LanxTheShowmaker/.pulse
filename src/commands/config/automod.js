import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
import { logger } from "../../core/logger.js";

const TOGGLE_KEYS = ["inviteFilter", "linkFilter", "newAccountFilter", "zalgoFilter", "scamUrlFilter", "clusterSpam", "autoLockdown"];
const DETECTOR_TOGGLE = ["spam", "duplicate", "mentions", "invites", "links", "words", "caps", "emoji", "raid"];
const NUMERIC_KEYS = ["maxMentions", "spamThreshold", "spamWindowMs", "raidJoinThreshold", "raidWindowMs", "newAccountMaxAgeDays", "emojiSpamThreshold", "clusterSpamThreshold", "clusterSpamWindowMs", "capsMinChars", "capsPercent", "maxRoleMentions"];
const NUMERIC_LABELS = {
    maxMentions: "Max user mentions",
    maxRoleMentions: "Max role mentions",
    spamThreshold: "Spam threshold",
    spamWindowMs: "Spam window (ms)",
    raidJoinThreshold: "Raid join threshold",
    raidWindowMs: "Raid window (ms)",
    newAccountMaxAgeDays: "New account age (days)",
    emojiSpamThreshold: "Emoji spam threshold",
    clusterSpamThreshold: "Cluster spam threshold",
    clusterSpamWindowMs: "Cluster spam window (ms)",
    capsMinChars: "Caps min chars",
    capsPercent: "Caps percent",
};
const DEFAULTS = {
    maxMentions: 5, maxRoleMentions: 3, spamThreshold: 5, spamWindowMs: 5000, raidJoinThreshold: 10, raidWindowMs: 30000,
    newAccountMaxAgeDays: 7, emojiSpamThreshold: 10, clusterSpamThreshold: 3, clusterSpamWindowMs: 60000,
    capsMinChars: 12, capsPercent: 80,
};
function num(a, k) { return typeof a[k] === "number" ? a[k] : DEFAULTS[k]; }
function bool(a, k, def=true) { if (typeof a[k] === "boolean") return a[k]; if (k==="linkFilter") return false; return def; }
function getDetectorEnabled(am, key){ return am.detectors?.[key]?.enabled ?? (key==="words"||key==="caps" ? false : true); }

function buildStatusEmbed(automod, guild) {
    const a = automod ?? {};
    const d = a.detectors ?? {};
    const det = (k) => getDetectorEnabled(a,k) ? "🟢 Enabled" : "🔴 Disabled";
    const wordsCount = (d.words?.rules ?? a.blockedWords ?? []).length;
    return embeds.info("Automod", "MESSAGE → NORMALIZE → DETECT → EXEMPT → ACTION → LOG → CASE", [
        { name: "Spam", value: `${det("spam")} • ${a.spamThreshold??5} in ${a.spamWindowMs??5000}ms`, inline: true },
        { name: "Duplicate", value: `${det("duplicate")}`, inline: true },
        { name: "Mentions", value: `${det("mentions")} • ${a.maxMentions??5} user / ${a.maxRoleMentions??3} role`, inline: true },
        { name: "Invites", value: `${det("invites")} • ${bool(a,"inviteFilter")?"Block":"Allow"}`, inline: true },
        { name: "Links/Phishing", value: `${det("links")} • ${wordsCount} word rules`, inline: true },
        { name: "Caps", value: `${det("caps")} • ${a.capsMinChars??12} chars ${a.capsPercent??80}%`, inline: true },
        { name: "Emoji/Char", value: `${det("emoji")}`, inline: true },
        { name: "Raid", value: `${det("raid")} • ${a.raidJoinThreshold??10} in ${a.raidWindowMs??30000}ms`, inline: true },
        { name: "Log Channel", value: guild?.channels?.cache?.get(a.logChannelId)?.toString() ?? a.logChannelId ? `<#${a.logChannelId}>` : "Not set", inline: true },
        { name: "Mode", value: a.enabled===false ? "🔴 Disabled" : "🟢 Enabled", inline: true },
    ]);
}
function mainMenu(){
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("pulse:automod:main").setPlaceholder("Automod — choose section").addOptions([
        { label:"Detectors", value:"detectors", description:"Enable/disable spam, mentions, etc.", emoji:"🛡️" },
        { label:"Thresholds", value:"thresholds", description:"Spam, caps, emoji numbers", emoji:"🎚️" },
        { label:"Words & Phrases", value:"words", description:"Blocked terms (42 rules)", emoji:"🚫" },
        { label:"Whitelists", value:"whitelists", description:"Invite domains, channels", emoji:"✅" },
        { label:"Exemptions", value:"exemptions", description:"Staff/roles/channels", emoji:"🙈" },
        { label:"Status", value:"status", description:"Overview", emoji:"📊" },
        { label:"Test", value:"test", description:"Dry-run a message", emoji:"🧪" },
    ]));
}
function detectorMenu(am){
    const d = am.detectors ?? {};
    const isEnabled = (k)=> getDetectorEnabled(am,k);
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("pulse:automod:detectorToggle").setPlaceholder("Toggle detector").addOptions([
        { label:`Spam ${isEnabled("spam")?"🟢":"🔴"}`, value:"spam", description:"Flood, repeated content" },
        { label:`Duplicate ${isEnabled("duplicate")?"🟢":"🔴"}`, value:"duplicate", description:"Same message repeats" },
        { label:`Mentions ${isEnabled("mentions")?"🟢":"🔴"}`, value:"mentions", description:"@everyone, many mentions" },
        { label:`Invites ${isEnabled("invites")?"🟢":"🔴"}`, value:"invites", description:"Discord invites" },
        { label:`Links ${isEnabled("links")?"🟢":"🔴"}`, value:"links", description:"Suspicious URLs" },
        { label:`Words ${isEnabled("words")?"🟢":"🔴"}`, value:"words", description:"Blocked phrases" },
        { label:`Caps ${isEnabled("caps")?"🟢":"🔴"}`, value:"caps", description:"ALL CAPS" },
        { label:`Emoji ${isEnabled("emoji")?"🟢":"🔴"}`, value:"emoji", description:"Repeated chars/emoji" },
        { label:`Raid ${isEnabled("raid")?"🟢":"🔴"}`, value:"raid", description:"Burst protection" },
    ]));
}

export default {
    data: new SlashCommandBuilder().setName("automod").setDescription("Manage automated moderation."),
    category: "Config",
    async execute(interaction){
        const member = interaction.member;
        const config = await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        if(!isStaff(member, config)) return interaction.reply({ embeds:[embeds.error("Missing permission","Only staff can configure automod.")], flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const cfg = await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
        const am = cfg?.automod ?? {};
        const embed = buildStatusEmbed(am, interaction.guild);
        const row = mainMenu();
        const back = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("pulse:automod:main").setPlaceholder("Automod sections").addOptions([{label:"Back to status", value:"status"}]));
        // Register handlers
        const client = interaction.client;
        client.components.set("pulse:automod:main", async (i)=>{
            const v = i.values[0];
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            if(v==="status"){
                await i.update({ embeds:[buildStatusEmbed(cur, i.guild)], components:[mainMenu()] }).catch(()=>{});
            } else if(v==="detectors"){
                await i.update({ embeds:[buildStatusEmbed(cur, i.guild)], components:[detectorMenu(cur), mainMenu()] }).catch(()=>{});
            } else if(v==="thresholds"){
                const opts = Object.keys(NUMERIC_LABELS).slice(0,25).map(k=>({ label: NUMERIC_LABELS[k], value:k, description:`Current: ${cur[k] ?? DEFAULTS[k]}`.slice(0,100) }));
                const menu = new StringSelectMenuBuilder().setCustomId("pulse:automod:thresholdsMenu").setPlaceholder("Pick threshold to edit").addOptions(opts);
                await i.update({ embeds:[embeds.info("Thresholds","Select a threshold to edit")], components:[new ActionRowBuilder().addComponents(menu), mainMenu()] }).catch(()=>{});
            } else if(v==="words"){
                const words = cur.detectors?.words?.rules ?? cur.blockedWords ?? [];
                const embed2 = embeds.info("Blocked words", words.length ? words.slice(0,20).map((w,idx)=> `${idx+1}. \`${w.phrase ?? w.word}\` (${w.match??"phrase"}) ${w.severity??""}`).join("\n") : "No rules. Add with `Add word`", [{ name:"Count", value:`${words.length} rules`}]);
                const row2 = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("pulse:automod:wordsMenu").setPlaceholder("Words").addOptions([
                        { label:"Add word/phrase", value:"add" },
                        { label:"Remove word", value:"remove" },
                        { label:"List all", value:"list" },
                    ])
                );
                await i.update({ embeds:[embed2], components:[row2, mainMenu()] }).catch(()=>{});
            } else if(v==="whitelists"){
                const embed2 = embeds.info("Whitelists", `Invite servers: ${(cur.whitelistServers??[]).join(", ") || "—"}\nDomains: ${(cur.whitelistDomains??[]).join(", ") || "—"}\nChannels: ${(cur.whitelistInviteChannels??[]).join(", ") || "—"}`, []);
                const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("pulse:automod:whitelistMenu").setPlaceholder("Whitelist").addOptions([
                    { label:"Add whitelist", value:"add" },
                    { label:"Clear invites", value:"clearInvites" },
                    { label:"Clear domains", value:"clearDomains" },
                ]));
                await i.update({ embeds:[embed2], components:[row2, mainMenu()] }).catch(()=>{});
            } else if(v==="exemptions"){
                const curEx = cur.exemptions ?? {};
                const embed2 = embeds.info("Exemptions", `Roles: ${(curEx.roles??[]).map(id=>`<@&${id}>`).join(", ") || "—"}\nUsers: ${(curEx.users??[]).map(id=>`<@${id}>`).join(", ") || "—"}\nChannels: ${(curEx.channels??[]).map(id=>`<#${id}>`).join(", ") || "—"}`, []);
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("pulse:automod:exemptRole").setLabel("Add Role Exempt").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("pulse:automod:exemptChannel").setLabel("Add Channel Exempt").setStyle(ButtonStyle.Secondary)
                );
                await i.update({ embeds:[embed2], components:[row2, mainMenu()] }).catch(()=>{});
            } else if(v==="test"){
                const modal = new ModalBuilder().setCustomId("pulse:automod:testModal").setTitle("Test message");
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("content").setLabel("Message to test").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)));
                await i.showModal(modal).catch(()=>{});
            } else {
                await i.update({ embeds:[buildStatusEmbed(cur, i.guild)], components:[mainMenu()] }).catch(()=>{});
            }
        });
        client.components.set("pulse:automod:detectorToggle", async (i)=>{
            const key = i.values[0];
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const curEnabled = getDetectorEnabled(cur, key);
            const nextDet = { ...(cur.detectors ?? {}), [key]: { ...(cur.detectors?.[key] ?? {}), enabled: !curEnabled } };
            await client.services.settings.patch(i.guildId, { automod: { ...cur, detectors: nextDet } }).catch(e=>logger.error("automod","patch",e));
            const updated = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            await i.update({ embeds:[buildStatusEmbed(updated, i.guild)], components:[detectorMenu(updated), mainMenu()] }).catch(()=>{});
        });
        client.components.set("pulse:automod:wordsMenu", async (i)=>{
            const v = i.values[0];
            if(v==="add"){
                const modal = new ModalBuilder().setCustomId("pulse:automod:addWord").setTitle("Add blocked phrase");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("phrase").setLabel("Phrase / word / regex").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("match").setLabel("Match: exact|phrase|regex").setStyle(TextInputStyle.Short).setRequired(false).setValue("phrase")),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("severity").setLabel("Severity LOW|MEDIUM|HIGH|CRITICAL").setStyle(TextInputStyle.Short).setRequired(false).setValue("HIGH")),
                );
                await i.showModal(modal).catch(()=>{});
            } else if(v==="remove"){
                const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
                const words = cur.detectors?.words?.rules ?? [];
                if(!words.length) return i.reply({ embeds:[embeds.warn("No rules","")], flags: MessageFlags.Ephemeral }).catch(()=>{});
                const opts = words.slice(0,25).map((w,idx)=>({ label: String(w.phrase).slice(0,100), value: String(idx) }));
                const menu = new StringSelectMenuBuilder().setCustomId("pulse:automod:removeWordSelect").setPlaceholder("Select to remove").addOptions(opts);
                await i.reply({ components:[new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(()=>{});
            } else {
                const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
                const words = cur.detectors?.words?.rules ?? [];
                await i.reply({ embeds:[embeds.info("Words", words.map((w,idx)=>`${idx}: ${w.phrase} (${w.match})`).join("\n") || "None")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        });
        // Thresholds
        client.components.set("pulse:automod:thresholdsMenu", async (i)=>{
            const key = i.values[0];
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const modal = new ModalBuilder().setCustomId(`pulse:automod:thresholdModal:${key}`).setTitle(NUMERIC_LABELS[key] ?? key);
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel(NUMERIC_LABELS[key] ?? key).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(cur[key] ?? DEFAULTS[key] ?? ""))));
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:automod:thresholdModal", async (i)=>{
            if(!i.isModalSubmit()) return;
            const key = i.customId.split(":")[3];
            const raw = i.fields.getTextInputValue("value");
            const val = Number.parseInt(raw,10);
            if(!Number.isFinite(val) || val < 1) return i.reply({ embeds:[embeds.error("Invalid","Enter positive number")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            await client.services.settings.patch(i.guildId, { automod: { ...cur, [key]: Math.min(val, 1000000) } });
            const updated = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            await i.reply({ embeds:[embeds.success("Updated",`${NUMERIC_LABELS[key]} = ${val}`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
            // Refresh status
            try{ const msg = await i.channel.messages.fetch(i.message?.id ?? "").catch(()=>null); }catch{}
        });
        // Whitelists — simple: invite servers/domains
        client.components.set("pulse:automod:whitelistMenu", async (i)=>{
            const v = i.values[0];
            if(v==="add"){
                const modal = new ModalBuilder().setCustomId("pulse:automod:whitelistModal").setTitle("Add whitelist");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("type").setLabel("Type: inviteServer|domain|channel").setStyle(TextInputStyle.Short).setRequired(true).setValue("domain")),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel("Value (e.g. discord.gg/abc or example.com or #channel)").setStyle(TextInputStyle.Short).setRequired(true)),
                );
                await i.showModal(modal).catch(()=>{});
            } else if(v==="clearInvites"){
                const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
                await client.services.settings.patch(i.guildId, { automod: { ...cur, whitelistServers: [] } });
                await i.reply({ embeds:[embeds.success("Cleared","Invite whitelist cleared")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            } else if(v==="clearDomains"){
                const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
                await client.services.settings.patch(i.guildId, { automod: { ...cur, whitelistDomains: [] } });
                await i.reply({ embeds:[embeds.success("Cleared","Domain whitelist cleared")], flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        });
        client.components.set("pulse:automod:exemptRole", async (i)=>{
            const menu = new RoleSelectMenuBuilder().setCustomId("pulse:automod:exemptRoleSelect").setPlaceholder("Select role to exempt").setMaxValues(1);
            await i.reply({ components:[new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:automod:exemptRoleSelect", async (i)=>{
            const roleId = i.values[0];
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const ex = cur.exemptions ?? {};
            const roles = [...(ex.roles ?? []), roleId];
            await client.services.settings.patch(i.guildId, { automod: { ...cur, exemptions: { ...ex, roles: [...new Set(roles)] } } });
            await i.reply({ embeds:[embeds.success("Exempted",`Role <@&${roleId}> exempted`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:automod:exemptChannel", async (i)=>{
            const menu = new ChannelSelectMenuBuilder().setCustomId("pulse:automod:exemptChannelSelect").setPlaceholder("Select channel to exempt").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
            await i.reply({ components:[new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:automod:exemptChannelSelect", async (i)=>{
            const chId = i.values[0];
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const ex = cur.exemptions ?? {};
            const channels = [...(ex.channels ?? []), chId];
            await client.services.settings.patch(i.guildId, { automod: { ...cur, exemptions: { ...ex, channels: [...new Set(channels)] } } });
            await i.reply({ embeds:[embeds.success("Exempted",`Channel <#${chId}> exempted`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:automod:whitelistAdd", async (i)=>{
            const modal = new ModalBuilder().setCustomId("pulse:automod:whitelistModal").setTitle("Add whitelist");
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("type").setLabel("Type: inviteServer|domain|channel").setStyle(TextInputStyle.Short).setRequired(true).setValue("domain")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel("Value (e.g. discord.gg/abc or example.com or #channel)").setStyle(TextInputStyle.Short).setRequired(true)),
            );
            await i.showModal(modal).catch(()=>{});
        });
        client.components.set("pulse:automod:whitelistModal", async (i)=>{
            if(!i.isModalSubmit()) return;
            const type = i.fields.getTextInputValue("type").toLowerCase();
            const val = i.fields.getTextInputValue("value").trim();
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const next = { ...cur };
            if(type.includes("invite")){ next.whitelistServers = [...(cur.whitelistServers ?? []), val]; }
            else if(type.includes("channel")){ next.whitelistInviteChannels = [...(cur.whitelistInviteChannels ?? []), val.replace(/[<#>]/g,"")]; }
            else { next.whitelistDomains = [...(cur.whitelistDomains ?? []), val]; }
            await client.services.settings.patch(i.guildId, { automod: next });
            await i.reply({ embeds:[embeds.success("Whitelisted",`${type}: ${val}`)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:automod:addWord", async (i)=>{
            if(!i.isModalSubmit()) return;
            const phrase = i.fields.getTextInputValue("phrase");
            const match = (i.fields.getTextInputValue("match") || "phrase").toLowerCase();
            const severity = (i.fields.getTextInputValue("severity") || "HIGH").toUpperCase();
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const rules = cur.detectors?.words?.rules ?? [];
            rules.push({ phrase, match: ["exact","phrase","regex"].includes(match)?match:"phrase", severity: ["LOW","MEDIUM","HIGH","CRITICAL"].includes(severity)?severity:"HIGH" });
            const nextDet = { ...(cur.detectors ?? {}), words: { ...(cur.detectors?.words ?? {}), rules, enabled: true } };
            await client.services.settings.patch(i.guildId, { automod: { ...cur, detectors: nextDet } });
            await i.reply({ embeds:[embeds.success("Added",`Blocked \`${phrase}\``)], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        client.components.set("pulse:automod:removeWordSelect", async (i)=>{
            const idx = Number(i.values[0]);
            const cur = (await client.services.settings.get(i.guildId).catch(()=>null))?.automod ?? {};
            const rules = cur.detectors?.words?.rules ?? [];
            rules.splice(idx,1);
            const nextDet = { ...(cur.detectors ?? {}), words: { ...(cur.detectors?.words ?? {}), rules } };
            await client.services.settings.patch(i.guildId, { automod: { ...cur, detectors: nextDet } });
            await i.update({ embeds:[embeds.success("Removed","Rule removed")], components:[] }).catch(()=>{});
        });
        client.components.set("pulse:automod:testModal", async (i)=>{
            if(!i.isModalSubmit()) return;
            const content = i.fields.getTextInputValue("content");
            const res = await client.services.automod.testMessage(i.guild, content, i.member);
            const info = res?.violation ? `**YES** — ${res.violation.type} • ${res.violation.severity} • ${Math.round(res.violation.confidence*100)}% • ${res.action}` : "**NO** — would not trigger";
            await i.reply({ embeds:[embeds.info("Test result", info, [{ name:"Detector", value: res?.violation?.type ?? "—"}, { name:"Action", value: res?.action ?? "log"}])], flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
        await interaction.editReply({ embeds:[embed], components:[row] }).catch(()=>{});
    }
};
