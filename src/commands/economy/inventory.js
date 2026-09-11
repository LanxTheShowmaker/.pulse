import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
import { isStaff } from "../../core/services.js";
export default {
    data: new SlashCommandBuilder().setName("inventory").setDescription("View inventory").addUserOption(o=>o.setName("user").setDescription("User")),
    category:"Economy",
    async execute(interaction){
        const user=interaction.options.getUser("user")||interaction.user;
        if(user.id !== interaction.user.id){
            const cfg=await interaction.client.services.settings.get(interaction.guildId).catch(()=>null);
            if(!isStaff(interaction.member,cfg)) return interaction.reply({ embeds:[embeds.error("No perm","Staff only")], flags: MessageFlags.Ephemeral});
        }
        const inv=await interaction.client.prisma.shopInventory.findMany({ where:{ guildId: interaction.guildId, userId: user.id }}).catch(()=>[]);
        if(!inv.length) return interaction.reply({ embeds:[new EmbedBuilder().setColor(Theme.muted).setDescription(`No items for <@${user.id}> yet — buy one with /shop buy`)], flags: MessageFlags.Ephemeral});
        const ids=[...new Set(inv.map(i=>i.itemId))];
        const items=await interaction.client.prisma.shopItem.findMany({ where:{ id:{ in:ids }}}).catch(()=>[]);
        const map=new Map(items.map(it=>[it.id,it]));
        const desc=inv.map(e=> `${map.get(e.itemId)?.name||"Unknown"} x${e.quantity}`).join("\n");
        return interaction.reply({ embeds:[new EmbedBuilder().setColor(Theme.gold).setTitle(`${user.tag} — Inventory`).setDescription(desc)], flags: MessageFlags.Ephemeral});
    }
};