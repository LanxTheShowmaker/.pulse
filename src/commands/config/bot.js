import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits, ButtonStyle, TextInputStyle } from "discord.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
import { Theme } from "../../design/theme.js";
import { logger } from "../../core/logger.js";

export default {
    data: new SlashCommandBuilder().setName("botprofile").setDescription("Per-server bot identity (nickname/avatar) — not global")
        .addSubcommand(s => s.setName("view").setDescription("View current per-server identity"))
        .addSubcommand(s => s.setName("name").setDescription("Set per-server nickname").addStringOption(o => o.setName("nickname").setDescription("2-32 chars, empty to reset").setMinLength(1).setMaxLength(32)))
        .addSubcommand(s => s.setName("avatar").setDescription("Set per-server avatar").addStringOption(o => o.setName("url").setDescription("Image URL (png/jpg/webp)")).addAttachmentOption(o => o.setName("file").setDescription("Upload image")))
        .addSubcommand(s => s.setName("reset").setDescription("Reset to global defaults")),
    category: "Config",
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ embeds: [embeds.error("Guild only", "Use in a server")], flags: MessageFlags.Ephemeral });
        const cfg = await interaction.client.services.settings.get(guild.id).catch(() => null);
        const member = interaction.member;
        const hasPerm = member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.ManageNicknames) || isStaff(member, cfg);
        if (!hasPerm) return interaction.reply({ embeds: [embeds.error("No permission", "Need Manage Guild or Manage Nicknames or Staff role")], flags: MessageFlags.Ephemeral });
        const branding = interaction.client.services.branding;
        const sub = interaction.options.getSubcommand();

        if (sub === "view") {
            const b = await branding.get(guild.id);
            const disp = await branding.getDisplay(guild);
            const me = guild.members.me;
            const currentNick = me?.nickname || "*None (using global)*";
            const canNick = me?.permissions.has(PermissionFlagsBits.ChangeNickname) || me?.permissions.has(PermissionFlagsBits.ManageNicknames);
            let avatarStatus = "*Not configured*";
            if (b.avatarUrl) {
                avatarStatus = `[Link](${b.avatarUrl})`;
                if (me?.avatar) avatarStatus += ` — guild avatar active`;
                else avatarStatus += ` — stored, will apply on next edit`;
            }
            const embed = new EmbedBuilder().setColor(Theme.panel).setAuthor({ name: `${guild.name} • Bot Profile`, iconURL: guild.iconURL() ?? undefined })
                .setTitle(`Per-Server Identity — ${disp.name}`)
                .setThumbnail(disp.icon)
                .addFields(
                    { name: "Display Name", value: b.displayName || "*Default*", inline: true },
                    { name: "Nickname", value: currentNick, inline: true },
                    { name: "Can Change Nickname", value: canNick ? "Yes" : "Missing permission", inline: true },
                    { name: "Avatar", value: avatarStatus, inline: false },
                    { name: "Banner", value: b.bannerUrl ? `[Link](${b.bannerUrl})` : "*Default*", inline: true }
                ).setDescription(
                    `Changing this server **does not** affect other servers.\n\n` +
                    `**Nickname:** Applied via \`guild.members.me.setNickname()\`.\n` +
                    `**Avatar:** Per-server via \`guild.members.editMe({ avatar })\`.`
                ).setFooter({ text: "Per-server. Reapplied on restart." }).setTimestamp();
            if (b.avatarUrl) embed.setImage(b.avatarUrl);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("botprofile:editName").setLabel("Set Nickname").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("botprofile:editAvatar").setLabel("Set Avatar").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("botprofile:reset").setLabel("Reset").setStyle(ButtonStyle.Danger)
            );

            // Component handlers
            interaction.client.components.set("botprofile:editName", async (i) => {
                if (i.guildId !== guild.id || (!isStaff(i.member, await i.client.services.settings.get(i.guildId).catch(() => null)) && !i.member.permissions.has(PermissionFlagsBits.ManageGuild))) return i.reply({ embeds: [embeds.error("No perm", "")], flags: MessageFlags.Ephemeral });
                const modal = new ModalBuilder().setCustomId("botprofile:nameModal").setTitle("Set Nickname");
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nick").setLabel("Nickname (empty to reset)").setStyle(TextInputStyle.Short).setMaxLength(32).setValue(b.nickname || b.displayName || "").setRequired(false)));
                await i.showModal(modal).catch(() => {});
            });
            interaction.client.components.set("botprofile:nameModal", async (i) => {
                if (!i.isModalSubmit()) return;
                const nick = i.fields.getTextInputValue("nick").trim();
                if (nick && (nick.length < 2 || nick.length > 32)) return i.reply({ embeds: [embeds.error("Invalid", "2-32 chars")], flags: MessageFlags.Ephemeral });
                try {
                    await branding.set(guild.id, { nickname: nick || null, displayName: nick || null });
                    const me2 = guild.members.me;
                    if (me2) {
                        if (!nick) await me2.setNickname(null).catch(e => { throw e; });
                        else {
                            if (!me2.permissions.has(PermissionFlagsBits.ChangeNickname) && !me2.permissions.has(PermissionFlagsBits.ManageNicknames)) throw new Error("Missing ChangeNickname/ManageNicknames");
                            await me2.setNickname(nick).catch(e => { throw e; });
                        }
                    }
                    await i.reply({ embeds: [embeds.success("Updated", nick ? `Nickname → \`${nick}\`` : "Nickname reset")], flags: MessageFlags.Ephemeral }).catch(() => {});
                } catch (e) {
                    await i.reply({ embeds: [embeds.error("Failed", e.message.slice(0, 300))], flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            });
            interaction.client.components.set("botprofile:editAvatar", async (i) => {
                const cfg = await i.client.services.settings.get(i.guildId).catch(() => null);
                if (i.guildId !== guild.id || (!isStaff(i.member, cfg) && !i.member.permissions.has(PermissionFlagsBits.ManageGuild))) return i.reply({ embeds: [embeds.error("No perm", "")], flags: MessageFlags.Ephemeral });
                const modal = new ModalBuilder().setCustomId("botprofile:avatarModal").setTitle("Set Avatar URL");
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("url").setLabel("Image URL (or upload via /botprofile avatar)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("https://...png")));
                await i.showModal(modal).catch(() => {});
            });
            interaction.client.components.set("botprofile:avatarModal", async (i) => {
                const cfg = await i.client.services.settings.get(i.guildId).catch(() => null);
                if (i.guildId !== guild.id || (!isStaff(i.member, cfg) && !i.member.permissions.has(PermissionFlagsBits.ManageGuild))) return i.reply({ embeds: [embeds.error("No perm", "")], flags: MessageFlags.Ephemeral });
                const url = i.fields.getTextInputValue("url").trim();
                if (url && !/^https?:\/\/.+\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url) && !url.includes("cdn.discordapp")) return i.reply({ embeds: [embeds.error("Invalid URL", "Use https png/jpg/webp/gif or cdn.discordapp")], flags: MessageFlags.Ephemeral });
                try {
                    let perGuildSuccess = false;
                    let discordError = null;
                    if (url) {
                        try {
                            const res = await fetch(url).catch(() => null);
                            if (!res || !res.ok) throw new Error("Avatar download failed");
                            const ct = res.headers.get("content-type") || "";
                            if (!ct.startsWith("image/")) throw new Error("URL did not return an image");
                            const buf = Buffer.from(await res.arrayBuffer());
                            if (buf.length === 0) throw new Error("Downloaded image is empty");
                            if (buf.length > 8 * 1024 * 1024) throw new Error("Image exceeds 8MB limit");
                            const b64 = `data:${ct};base64,${buf.toString("base64")}`;
                            if (typeof guild.members.editMe === "function") {
                                await guild.members.editMe({ avatar: b64, reason: "Branding: per-server avatar" });
                                perGuildSuccess = true;
                            } else if (guild.members.me && typeof guild.members.me.edit === "function") {
                                await guild.members.me.edit({ avatar: b64 });
                                perGuildSuccess = true;
                            }
                        } catch (e) { discordError = e; }
                    } else {
                        if (typeof guild.members.editMe === "function") {
                            await guild.members.editMe({ avatar: null, reason: "Branding reset avatar" }).catch(() => {});
                            perGuildSuccess = true;
                        } else {
                            try { await guild.members.me.edit({ avatar: null }); perGuildSuccess = true; } catch {}
                        }
                    }
                    await branding.set(guild.id, { avatarUrl: url || null });
                    let desc = url ? `Stored avatar: [Link](${url})` : "Avatar cleared";
                    if (perGuildSuccess) desc += `\nPer-guild avatar applied — visible change in **${guild.name}** only`;
                    else if (discordError) desc += `\nFailed: ${discordError.message?.slice(0, 200) || "unknown error"}`;
                    else desc += `\nStored for embeds/panels.`;
                    await i.reply({ embeds: [perGuildSuccess ? embeds.success("Avatar", desc) : embeds.error("Avatar", desc)], flags: MessageFlags.Ephemeral }).catch(() => {});
                } catch (e) {
                    await i.reply({ embeds: [embeds.error("Failed", e.message.slice(0, 300))], flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            });
            interaction.client.components.set("botprofile:reset", async (i) => {
                const cfg = await i.client.services.settings.get(i.guildId).catch(() => null);
                if (i.guildId !== guild.id || (!isStaff(i.member, cfg) && !i.member.permissions.has(PermissionFlagsBits.ManageGuild))) return i.reply({ embeds: [embeds.error("No perm", "")], flags: MessageFlags.Ephemeral });
                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("botprofile:reset:confirm").setLabel("Confirm Reset").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("botprofile:reset:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
                );
                await i.reply({ embeds: [embeds.warn("Reset?", "Clear nickname/avatar/banner for this server only")], components: [confirmRow], flags: MessageFlags.Ephemeral }).catch(() => {});
            });
            interaction.client.components.set("botprofile:reset:confirm", async (i) => {
                const cfg = await i.client.services.settings.get(i.guildId).catch(() => null);
                if (i.guildId !== guild.id || (!isStaff(i.member, cfg) && !i.member.permissions.has(PermissionFlagsBits.ManageGuild))) return i.reply({ embeds: [embeds.error("No perm", "")], flags: MessageFlags.Ephemeral });
                await branding.set(guild.id, { displayName: null, avatarUrl: null, bannerUrl: null, nickname: null });
                try {
                    if (typeof guild.members.editMe === "function") {
                        await guild.members.editMe({ nick: null, avatar: null, reason: "Branding reset" }).catch(() => {});
                    } else {
                        await guild.members.me.setNickname(null).catch(() => {});
                        await guild.members.me.edit({ avatar: null }).catch(() => {});
                    }
                } catch {}
                await i.update({ embeds: [embeds.success("Reset", "Per-server identity cleared")], components: [] }).catch(() => {});
            });
            interaction.client.components.set("botprofile:reset:cancel", async (i) => {
                const cfg = await i.client.services.settings.get(i.guildId).catch(() => null);
                if (i.guildId !== guild.id || (!isStaff(i.member, cfg) && !i.member.permissions.has(PermissionFlagsBits.ManageGuild))) return i.reply({ embeds: [embeds.error("No perm", "")], flags: MessageFlags.Ephemeral });
                await i.update({ embeds: [embeds.info("Cancelled", "No changes made.")], components: [] }).catch(() => {});
            });
            return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }

        if (sub === "name") {
            const nick = interaction.options.getString("nickname");
            if (nick !== null && nick.trim().length > 0 && (nick.trim().length < 2 || nick.trim().length > 32)) return interaction.reply({ embeds: [embeds.error("Invalid", "2-32 chars")], flags: MessageFlags.Ephemeral });
            const clean = nick ? nick.trim() : null;
            try {
                await branding.set(guild.id, { nickname: clean, displayName: clean });
                const me = guild.members.me;
                if (!me) throw new Error("Bot member not cached");
                if (!clean) await me.setNickname(null).catch(e => { throw e; });
                else {
                    if (!me.permissions.has(PermissionFlagsBits.ChangeNickname) && !me.permissions.has(PermissionFlagsBits.ManageNicknames)) throw new Error("Missing ChangeNickname/ManageNicknames");
                    await me.setNickname(clean).catch(e => { throw e; });
                }
                return interaction.reply({ embeds: [embeds.success("Nickname", clean ? `→ \`${clean}\` (visible change in **${guild.name}**)` : "Reset to global")], flags: MessageFlags.Ephemeral });
            } catch (e) {
                return interaction.reply({ embeds: [embeds.error("Failed", e.message.slice(0, 400))], flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === "avatar") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            let url = interaction.options.getString("url");
            const file = interaction.options.getAttachment("file");
            if (file) {
                const res = await interaction.client.services.assets.persistAttachment(guild, file).catch(e => null);
                url = res?.url || file.url;
            }
            if (!url) return interaction.editReply({ embeds: [embeds.error("No image", "Provide URL or file")] });
            if (!/^https?:\/\/.+\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url) && !url.includes("cdn.discordapp")) return interaction.editReply({ embeds: [embeds.error("Invalid", "Use https png/jpg/webp/gif")] });
            try {
                const res = await fetch(url).catch(() => null);
                if (!res || !res.ok) throw new Error("Fetch failed");
                const ct = res.headers.get("content-type") || "";
                if (!ct.startsWith("image/")) throw new Error("Not image");
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length > 8 * 1024 * 1024) throw new Error(">8MB");
                const b64 = `data:${ct};base64,${buf.toString("base64")}`;
                let perGuildSuccess = false;
                let discordError = null;
                try {
                    if (typeof guild.members.editMe === "function") {
                        await guild.members.editMe({ avatar: b64, reason: "Branding: per-server avatar" });
                        perGuildSuccess = true;
                    } else if (guild.members.me && typeof guild.members.me.edit === "function") {
                        await guild.members.me.edit({ avatar: b64 });
                        perGuildSuccess = true;
                    }
                } catch (e) { discordError = e; }
                await branding.set(guild.id, { avatarUrl: url });
                let desc = `Stored avatar: [Link](${url})\n`;
                if (perGuildSuccess) desc += `Per-guild avatar applied — visible change in **${guild.name}** only`;
                else {
                    const msg = discordError?.message?.slice(0, 200) || "unsupported";
                    desc += `Failed to apply per-guild avatar: ${msg}`;
                    logger.error("botprofile", "per-guild avatar apply failed", discordError);
                }
                return interaction.editReply({ embeds: [perGuildSuccess ? embeds.success("Avatar", desc) : embeds.error("Avatar", desc)] });
            } catch (e) {
                return interaction.editReply({ embeds: [embeds.error("Failed", e.message.slice(0, 400))] });
            }
        }

        if (sub === "reset") {
            await branding.set(guild.id, { displayName: null, avatarUrl: null, bannerUrl: null, nickname: null });
            try {
                if (typeof guild.members.editMe === "function") {
                    await guild.members.editMe({ nick: null, avatar: null, reason: "Branding reset" }).catch(() => {});
                } else {
                    await guild.members.me.setNickname(null).catch(() => {});
                    await guild.members.me.edit({ avatar: null }).catch(() => {});
                }
            } catch {}
            return interaction.reply({ embeds: [embeds.success("Reset", "Per-server identity cleared for **" + guild.name + "** — other servers unaffected")], flags: MessageFlags.Ephemeral });
        }
    }
};
