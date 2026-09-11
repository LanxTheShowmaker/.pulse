import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, SelectMenuBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionFlagsBits, ButtonStyle } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";

function shopEmbed(guild, items, balance){
    if(!items.length){
        return new EmbedBuilder().setColor(Theme.gold).setAuthor({ name:`${guild.name} • Shop`, iconURL: guild.iconURL()??undefined })
            .setDescription("The shop is empty — staff can add items with `/shop add`")
            .setFooter({ text:`Your balance: ${balance} coins` }).setTimestamp();
    }
    const lines = items.map((it, i)=>{
        const emoji = it.emoji ? `${it.emoji} ` : "";
        const role = it.roleId ? ` → <@&${it.roleId}>` : "";
        const stock = (it.stock!==null && it.stock!==undefined) ? ` • Stock: ${it.stock}` : "";
        const desc = it.description ? `\n  *${it.description.slice(0,120)}*` : "";
        return `**${i+1}.** ${emoji}**${it.name}** — **${it.price}** coins${role}${stock}${desc}`;
    }).join("\n\n");
    return new EmbedBuilder().setColor(Theme.gold).setAuthor({ name:`${guild.name} • Shop`, iconURL: guild.iconURL()??undefined })
        .setDescription(lines.slice(0,4000))
        .setFooter({ text:`Your balance: ${balance} coins. Use /shop buy.` }).setTimestamp();
}

export default {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("Shop — browse and buy with coins")
        .addSubcommand(s=>s.setName("view").setDescription("Browse the shop"))
        .addSubcommand(s=>s.setName("add").setDescription("Add an item (staff)")
            .addStringOption(o=>o.setName("name").setDescription("Item name (unique)").setRequired(true).setMaxLength(32))
            .addIntegerOption(o=>o.setName("price").setDescription("Price in coins").setRequired(true).setMinValue(1).setMaxValue(100000))
            .addStringOption(o=>o.setName("description").setDescription("Short description").setRequired(false).setMaxLength(200))
            .addRoleOption(o=>o.setName("role").setDescription("Role granted on purchase").setRequired(false))
            .addStringOption(o=>o.setName("emoji").setDescription("Emoji for display").setRequired(false).setMaxLength(32))
            .addIntegerOption(o=>o.setName("stock").setDescription("Limited stock (omit for unlimited)").setRequired(false).setMinValue(1).setMaxValue(10000))
        )
        .addSubcommand(s=>s.setName("remove").setDescription("Remove an item (staff)")
            .addStringOption(o=>o.setName("name").setDescription("Item name to remove").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(s=>s.setName("buy").setDescription("Buy an item")
            .addStringOption(o=>o.setName("name").setDescription("Item name").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(s=>s.setName("inventory").setDescription("View your purchases")
            .addUserOption(o=>o.setName("user").setDescription("Check another user (staff)").setRequired(false))
        ),
    category:"Economy",
    async autocomplete(interaction){
        const sub = interaction.options.getSubcommand();
        if(sub!=="buy" && sub!=="remove") return;
        const focused = interaction.options.getFocused();
        const items = await interaction.client.services.economy.getShopItems(interaction.guildId).catch(()=>[]);
        const filtered = items.filter(it=> it.name.toLowerCase().includes(focused.toLowerCase())).slice(0,25);
        await interaction.respond(filtered.map(it=>({ name:`${it.name} — ${it.price} coins`, value: it.name }))).catch(()=>{});
    },
    async execute(interaction){
        const sub = interaction.options.getSubcommand();
        const svc = interaction.client.services.economy;
        const guildId = interaction.guildId;
        const guild = interaction.guild;

        if(sub==="view"){
            await interaction.deferReply().catch(()=>{});
            const [items, bal] = await Promise.all([ svc.getShopItems(guildId), svc.get(guildId, interaction.user.id) ]);
            const embed = shopEmbed(guild, items, bal);
            // Add quick-buy select if items exist and <=25
            let comps = [];
            if(items.length && items.length <= 25){
                const menu = new SelectMenuBuilder().setCustomId(`pulse:shop:buy:${guildId}`).setPlaceholder("Quick buy — choose an item")
                    .addOptions(items.map(it=>({ label: `${it.name} — ${it.price}c`, value: it.name, description: (it.description??"").slice(0,100) || undefined, emoji: it.emoji && !it.emoji.startsWith("<") ? it.emoji : undefined })));
                // Discord requires emoji as string if unicode; custom emoji parsing omitted for simplicity
                comps = [new ActionRowBuilder().addComponents(menu)];
                // Register handler (always overwrite so role/price changes take effect)
                const key = `pulse:shop:buy:${guildId}`;
                interaction.client.components.set(key, async (i)=>{
                    const chosen = i.values?.[0];
                    if(!chosen) return;
                    await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
                    const res = await i.client.services.economy.buyItem(i.guildId, i.user.id, chosen, i.member).catch(e=>({ success:false, reason:e.message }));
                    if(!res.success){
                        await i.editReply({ embeds:[embeds.error("Purchase failed", res.reason ?? "Unknown error")] }).catch(()=>{});
                        return;
                    }
                    const ok = embeds.success("Purchase complete", `Bought **${res.item.name}** for **${res.item.price}** coins — balance **${res.newBalance}**${res.roleGranted?` • Role <@&${res.item.roleId}> granted`:""}`);
                    if(res.roleError) ok.addFields({ name:"Role warning", value: res.roleError.slice(0,1024) });
                    await i.editReply({ embeds:[ok] }).catch(()=>{});
                });
            }
            await interaction.editReply({ embeds:[embed], components: comps }).catch(()=>{});
            return;
        }

        if(sub==="add"){
            const config = await interaction.client.services.settings.get(guildId).catch(()=>null);
            if(!isStaff(interaction.member, config) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)){
                await interaction.reply({ embeds:[embeds.error("Missing permission","Only staff (ManageGuild) can add shop items.")], flags: MessageFlags.Ephemeral });
                return;
            }
            const name = interaction.options.getString("name", true);
            const price = interaction.options.getInteger("price", true);
            const description = interaction.options.getString("description");
            const role = interaction.options.getRole("role");
            const emoji = interaction.options.getString("emoji");
            const stock = interaction.options.getInteger("stock");
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
            try{
                const existing = await svc.getShopItem(guildId, name);
                if(existing){
                    await interaction.editReply({ embeds:[embeds.error("Already exists", `An item named **${name}** already exists. Remove it first or choose another name.`)] });
                    return;
                }
                if(role && role.id === guild.roles.everyone.id){
                    await interaction.editReply({ embeds:[embeds.error("Invalid role","Cannot sell @everyone.")] });
                    return;
                }
                if(role && (role.managed || role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.ManageGuild) || role.permissions.has(PermissionFlagsBits.ManageRoles) || role.permissions.has(PermissionFlagsBits.BanMembers) || role.permissions.has(PermissionFlagsBits.ModerateMembers))){
                    await interaction.editReply({ embeds:[embeds.error("Invalid role","Roles with moderation permissions or managed integrations cannot be sold.")] });
                    return;
                }
                // Validate role hierarchy: bot must be able to assign
                if(role && guild.members.me){
                    const botHighest = guild.members.me.roles.highest;
                    if(role.position >= botHighest.position){
                        await interaction.editReply({ embeds:[embeds.error("Invalid role",`I cannot grant <@&${role.id}> because it is at or above my highest role.`)] });
                        return;
                    }
                }
                const item = await svc.createShopItem(guildId, { name, description, price, roleId: role?.id ?? null, emoji: emoji ?? null, stock: stock ?? null });
                await interaction.editReply({ embeds:[embeds.success("Shop item added", `**${item.name}** — **${item.price}** coins${item.roleId?` → <@&${item.roleId}>`:""}`)] });
            }catch(e){
                await interaction.editReply({ embeds:[embeds.error("Failed to add item", e.message?.slice(0,1000) ?? String(e))] }).catch(()=>{});
            }
            return;
        }

        if(sub==="remove"){
            const config = await interaction.client.services.settings.get(guildId).catch(()=>null);
            if(!isStaff(interaction.member, config) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)){
                await interaction.reply({ embeds:[embeds.error("Missing permission","Only staff can remove shop items.")], flags: MessageFlags.Ephemeral });
                return;
            }
            const name = interaction.options.getString("name", true);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
            const del = await svc.deleteShopItem(guildId, name);
            if(!del){
                await interaction.editReply({ embeds:[embeds.error("Not found", `No item named **${name}**`)] });
                return;
            }
            await interaction.editReply({ embeds:[embeds.success("Removed", `Removed **${name}** from the shop.`)] });
            return;
        }

        if(sub==="buy"){
            const name = interaction.options.getString("name", true);
            await interaction.deferReply().catch(()=>{});
            const res = await svc.buyItem(guildId, interaction.user.id, name, interaction.member).catch(e=>({ success:false, reason:e.message }));
            if(!res.success){
                await interaction.editReply({ embeds:[embeds.error("Purchase failed", res.reason ?? "Unknown error")] });
                return;
            }
            const embed = embeds.success("Purchase complete", `Bought **${res.item.name}** for **${res.item.price}** coins — balance **${res.newBalance}**${res.roleGranted && res.item.roleId ? ` • Granted <@&${res.item.roleId}>` : ""}`);
            if(res.roleError) embed.addFields({ name:"Role note", value: res.roleError.slice(0,1024) });
            await interaction.editReply({ embeds:[embed] });
            return;
        }

        if(sub==="inventory"){
            const target = interaction.options.getUser("user") ?? interaction.user;
            // Staff can view others; non-staff viewing others? allow but ephemeral
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
            try{
                if(!interaction.client.prisma.shopInventory){
                    await interaction.editReply({ embeds:[embeds.info("Inventory", "Inventory tracking not available — update database with `prisma generate`.", [{ name:"User", value:`<@${target.id}>` }])] });
                    return;
                }
                const inv = await interaction.client.prisma.shopInventory.findMany({ where:{ guildId, userId: target.id }}).catch(()=>[]);
                if(!inv.length){
                    await interaction.editReply({ embeds:[embeds.info("Inventory", `No purchases yet for <@${target.id}>`)] });
                    return;
                }
                // Resolve item names
                const ids = [...new Set(inv.map(i=>i.itemId))];
                const items = await interaction.client.prisma.shopItem.findMany({ where:{ id:{ in: ids }}}).catch(()=>[]);
                const map = new Map(items.map(it=>[it.id, it]));
                const lines = inv.map(entry=>{
                    const it = map.get(entry.itemId);
                    const name = it ? it.name : `Unknown (${entry.itemId.slice(0,6)})`;
                    const price = it ? `${it.price}c` : "?";
                    return `• **${name}** ×${entry.quantity} — ${price}`;
                }).join("\n");
                await interaction.editReply({ embeds:[embeds.info(`Inventory — ${target.tag}`, lines.slice(0,4000))] });
            }catch(e){
                await interaction.editReply({ embeds:[embeds.error("Inventory failed", e.message)] }).catch(()=>{});
            }
            return;
        }
    }
};
