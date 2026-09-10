import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
import { lvlXp } from "../../services/leveling.js";

const PAGE_SIZE = 10;

function medal(i){
    if(i===0) return "🥇";
    if(i===1) return "🥈";
    if(i===2) return "🥉";
    return `**\`${String(i+1).padStart(2," ")}.\`**`;
}

function pageButtons(page, totalPages, baseId){
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${baseId}:${page-1}`).setLabel("◀ Previous").setStyle(ButtonStyle.Secondary).setDisabled(page<=0),
        new ButtonBuilder().setCustomId(`${baseId}:${page+1}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page>=totalPages-1),
    );
    return [row];
}

async function buildLeaderboardEmbed(guild, data, page, totalPages, kind){
    const { rows, total } = data;
    if(kind==="economy"){
        const lines = rows.length ? await Promise.all(rows.map(async (r, i)=>{
            const idx = page*PAGE_SIZE + i;
            return `${medal(idx)} <@${r.userId}> — **${r.balance}** coins`;
        })) : ["No entries yet. Earn coins to appear on the leaderboard."];
        const embed = new EmbedBuilder()
            .setColor(Theme.gold)
            .setAuthor({ name:`${guild.name} • Coin Leaderboard`, iconURL: guild.iconURL() ?? undefined })
            .setDescription(lines.join("\n"))
            .setFooter({ text:`Page ${page+1}/${Math.max(1,totalPages)} • ${total} entries` })
            .setTimestamp();
        if(guild.iconURL()) embed.setThumbnail(guild.iconURL({ size:128 }));
        return embed;
    }
    // leveling
    const lines = rows.length ? await Promise.all(rows.map(async (r, i)=>{
        const idx = page*PAGE_SIZE + i;
        const need = lvlXp(r.level);
        const pct = Math.min(100, Math.floor((r.xp/need)*100));
        return `${medal(idx)} <@${r.userId}> — **Lv ${r.level}** • ${r.xp}/${need} XP (${pct}%)`;
    })) : ["No entries yet. Send messages to earn XP and appear on the leaderboard."];
    const embed = new EmbedBuilder()
        .setColor(Theme.gold)
        .setAuthor({ name:`${guild.name} • Level Leaderboard`, iconURL: guild.iconURL() ?? undefined })
        .setDescription(lines.join("\n"))
        .setFooter({ text:`Page ${page+1}/${Math.max(1,totalPages)} • ${total} entries` })
        .setTimestamp();
    if(guild.iconURL()) embed.setThumbnail(guild.iconURL({ size:128 }));
    return embed;
}

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show the server leaderboard")
        .addStringOption(o=>o.setName("type").setDescription("Leaderboard type").setRequired(false).addChoices({name:"Levels", value:"levels"}, {name:"Coins", value:"coins"}))
        .addIntegerOption(o=>o.setName("page").setDescription("Page number (1-indexed)").setMinValue(1).setRequired(false)),
    category:"Utility",
    async execute(interaction){
        const kind = interaction.options.getString("type") ?? "levels";
        const pageArg = interaction.options.getInteger("page");
        let page = pageArg ? Math.max(0, pageArg-1) : 0;
        const guildId = interaction.guildId;
        const guild = interaction.guild;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
        const ephemeral = true;
        if(interaction.deferred) await interaction.editReply({ content:"Loading leaderboard… "}).catch(()=>{});

        let data, totalPages;
        // Fetch with clamped page after initial query
        if(kind==="coins"){
            data = await interaction.client.services.economy.getLeaderboard(guildId, PAGE_SIZE, page*PAGE_SIZE);
            totalPages = Math.max(1, Math.ceil((data.total||0)/PAGE_SIZE));
            if(page >= totalPages){ page = totalPages-1; data = await interaction.client.services.economy.getLeaderboard(guildId, PAGE_SIZE, page*PAGE_SIZE); }
            if(page<0){ page=0; data = await interaction.client.services.economy.getLeaderboard(guildId, PAGE_SIZE, 0); }
        } else {
            data = await interaction.client.services.leveling.getLeaderboard(guildId, PAGE_SIZE, page*PAGE_SIZE);
            totalPages = Math.max(1, Math.ceil((data.total||0)/PAGE_SIZE));
            if(page >= totalPages){ page = totalPages-1; data = await interaction.client.services.leveling.getLeaderboard(guildId, PAGE_SIZE, page*PAGE_SIZE); }
            if(page<0){ page=0; data = await interaction.client.services.leveling.getLeaderboard(guildId, PAGE_SIZE, 0); }
        }

        const embed = await buildLeaderboardEmbed(guild, data, page, totalPages, kind==="coins"?"economy":"levels");
        const baseId = `pulse:leaderboard:${kind}:${guildId}:${interaction.user.id}`;
        const comps = totalPages>1 ? pageButtons(page, totalPages, baseId) : [];

        // Register component handler for pagination (per-user, per-guild)
        const handlerKey = baseId;
        // Avoid duplicate registration leaks: overwrite
        interaction.client.components.set(handlerKey, async (i)=>{
            if(i.user.id !== interaction.user.id){
                await i.reply({ embeds:[embeds.error("Not yours","Only the command invoker can paginate this board.")], flags: MessageFlags.Ephemeral }).catch(()=>{});
                return;
            }
            const parts = i.customId.split(":");
            const newPage = parseInt(parts[parts.length-1],10);
            if(isNaN(newPage) || newPage<0 || newPage>=totalPages){
                await i.deferUpdate().catch(()=>{});
                return;
            }
            let nd;
            if(kind==="coins") nd = await i.client.services.economy.getLeaderboard(guildId, PAGE_SIZE, newPage*PAGE_SIZE);
            else nd = await i.client.services.leveling.getLeaderboard(guildId, PAGE_SIZE, newPage*PAGE_SIZE);
            const ne = await buildLeaderboardEmbed(guild, nd, newPage, totalPages, kind==="coins"?"economy":"levels");
            await i.update({ embeds:[ne], components: pageButtons(newPage, totalPages, baseId) }).catch(()=>{});
        });

        const payload = { embeds:[embed], components: comps };
        if(interaction.deferred || interaction.replied){
            await interaction.editReply(payload).catch(async ()=>{
                await interaction.followUp({ ...payload, flags: ephemeral?MessageFlags.Ephemeral:undefined }).catch(()=>{});
            });
        } else {
            await interaction.reply({ ...payload, flags: ephemeral?MessageFlags.Ephemeral:undefined }).catch(()=>{});
        }
    }
};
