import { EmbedBuilder } from "discord.js";
import { Theme } from "../design/theme.js";
import { logger } from "../core/logger.js";
const COOLDOWN = 60_000;
const cd = new Map();
const recentContent = new Map(); // anti-farm: userId -> { content, count, last }
export function lvlXp(lvl){ return 5 * lvl * lvl + 50 * lvl + 100; }
export function totalXpForLevel(lvl){
    let total=0;
    for(let i=0;i<lvl;i++) total+=lvlXp(i);
    return total;
}
export class LevelingService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async getConfig(guildId){
        try{
            let cfg=await this.prisma.levelConfig.findUnique({ where:{ guildId }}).catch(()=>null);
            if(!cfg){
                cfg=await this.prisma.levelConfig.create({ data:{ guildId }}).catch(()=> ({ guildId, xpMultiplier:1, channelMultipliers:"{}", roleRewards:"[]", streakEnabled:true, antiFarmEnabled:true, prestigeEnabled:true }));
            }
            return {
                xpMultiplier: cfg.xpMultiplier ?? 1.0,
                channelMultipliers: (()=>{ try{ return JSON.parse(cfg.channelMultipliers||"{}"); }catch{ return {}; }})(),
                roleRewards: (()=>{ try{ return JSON.parse(cfg.roleRewards||"[]"); }catch{ return []; }})(),
                streakEnabled: cfg.streakEnabled ?? true,
                antiFarmEnabled: cfg.antiFarmEnabled ?? true,
                prestigeEnabled: cfg.prestigeEnabled ?? true,
                announceChannelId: cfg.announceChannelId ?? null,
                raw: cfg
            };
        }catch(e){ return { xpMultiplier:1, channelMultipliers:{}, roleRewards:[], streakEnabled:true, antiFarmEnabled:true, prestigeEnabled:true, announceChannelId:null }; }
    }
    async setConfig(guildId, patch){
        const data={};
        if(patch.xpMultiplier!==undefined) data.xpMultiplier=Math.max(0.1, Math.min(5, patch.xpMultiplier));
        if(patch.channelMultipliers!==undefined) data.channelMultipliers=JSON.stringify(patch.channelMultipliers);
        if(patch.roleRewards!==undefined) data.roleRewards=JSON.stringify(patch.roleRewards);
        if(patch.streakEnabled!==undefined) data.streakEnabled=!!patch.streakEnabled;
        if(patch.antiFarmEnabled!==undefined) data.antiFarmEnabled=!!patch.antiFarmEnabled;
        if(patch.announceChannelId!==undefined) data.announceChannelId=patch.announceChannelId;
        return this.prisma.levelConfig.upsert({ where:{ guildId }, update:data, create:{ guildId, ...data }}).catch(()=>null);
    }
    async handleMessage(message){
        if (message.author.bot || !message.guild) return;
        const guildId=message.guild.id;
        const userId=message.author.id;
        const key = `${guildId}:${userId}`;
        const now = Date.now();
        if (cd.get(key) && now - cd.get(key) < COOLDOWN) return;
        // Anti-farm: repeated identical content
        const cfg=await this.getConfig(guildId);
        if(cfg.antiFarmEnabled){
            const prev=recentContent.get(key);
            if(prev && prev.content===message.content){
                prev.count=(prev.count||1)+1;
                if(prev.count>=3) return; // farming
            } else {
                recentContent.set(key,{ content:message.content, count:1, last:now });
            }
            // also ignore very short messages
            if(message.content.trim().length<5 && Math.random()<0.5) return;
        }
        cd.set(key, now);
        try{
            // Channel multiplier
            let mult=cfg.xpMultiplier;
            if(cfg.channelMultipliers[message.channel.id]) mult*=cfg.channelMultipliers[message.channel.id];
            // Role multiplier? For now simple
            const baseXp=Math.floor((Math.random()*15+5)*mult);
            const row = await this.prisma.xp.findUnique({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>null);
            let xp = (row?.xp ?? 0) + baseXp;
            let level = row?.level ?? 0;
            let needed = lvlXp(level);
            let leveled=false;
            const oldLevel=level;
            while(xp >= needed){ xp-=needed; level++; needed=lvlXp(level); leveled=true; }
            await this.prisma.xp.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ xp, level }, create:{ guildId, userId, xp, level }});
            // Streak handling
            if(cfg.streakEnabled){
                try{
                    const streakRow=await this.prisma.xpStreak.findUnique({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>null);
                    const today=new Date(); today.setHours(0,0,0,0);
                    const last=streakRow?.lastXpAt ? new Date(streakRow.lastXpAt) : null;
                    let streak=streakRow?.streak||0; let longest=streakRow?.longest||0;
                    if(!last || last < new Date(today.getTime()-24*3600*1000)){
                        // if last was yesterday, increment else reset to 1
                        const yesterday=new Date(today); yesterday.setDate(today.getDate()-1);
                        if(last && last >= yesterday) streak+=1;
                        else streak=1;
                        if(streak>longest) longest=streak;
                        await this.prisma.xpStreak.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ streak, longest, lastXpAt: new Date() }, create:{ guildId, userId, streak, longest, lastXpAt: new Date() }});
                    } else {
                        await this.prisma.xpStreak.update({ where:{ guildId_userId:{ guildId, userId }}, data:{ lastXpAt: new Date() }}).catch(()=>{});
                    }
                    // Check streak achievements
                    if(streak>=7) await this.client?.services?.achievements?.checkAndUnlock(guildId, userId, { streak }).catch(()=>{});
                }catch(e){ logger.error("leveling","streak failed",e); }
            }
            if(leveled){
                // Role rewards
                try{
                    const rewards=cfg.roleRewards.filter(r=> r.level<=level && r.level>oldLevel);
                    for(const r of rewards){
                        const member=message.member ?? await message.guild.members.fetch(userId).catch(()=>null);
                        if(member && message.guild.roles.cache.has(r.roleId) && !member.roles.cache.has(r.roleId)){
                            await member.roles.add(r.roleId).catch(()=>{});
                        }
                    }
                }catch{}
                // Announcement
                const chId=cfg.announceChannelId || message.channel.id;
                const ch=message.guild.channels.cache.get(chId) ?? message.channel;
                const embed = new EmbedBuilder().setColor(Theme.gold).setTitle(`Level Up — ${level}`).setDescription(`<@${userId}> reached **level ${level}**.`).setThumbnail(message.author.displayAvatarURL()).setTimestamp()
                    .setFooter({ text: `.pulse • streak ${await this.getStreak(guildId,userId).then(s=>s?.streak||0)}` });
                await ch.send({ content:`<@${userId}>`, embeds:[embed] }).catch(()=>{});
                // Automation & achievements & audit & analytics
                await this.client?.services?.automation?.trigger(guildId,"levelUp",{ userId, level, channelId: message.channel.id }).catch(()=>{});
                await this.client?.services?.achievements?.checkAndUnlock(guildId, userId, { level }).catch(()=>{});
                await this.client?.services?.audit?.log(guildId,{ actorId:userId, action:`level_up_${level}`, category:"leveling", details:{ level, xp }}).catch(()=>{});
            }
            // Weekly/monthly handled via leaderboard filters
        }catch(e){ logger.error("leveling","xp failed",e); }
    }
    async getStreak(guildId, userId){
        return this.prisma.xpStreak.findUnique({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>null);
    }
    async getRank(guildId, userId){
        const row = await this.prisma.xp.findUnique({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>null);
        if(!row) return null;
        const all = await this.prisma.xp.findMany({ where:{ guildId }, orderBy:[{ level:"desc" }, { xp:"desc" }] }).catch(()=>[]);
        const rank = all.findIndex(x=>x.userId===userId)+1;
        const total = all.length;
        return { ...row, rank, total, next: lvlXp(row.level) };
    }
    async getLeaderboard(guildId, limit=10, offset=0){
        limit = Math.min(Math.max(limit,1),25);
        offset = Math.max(offset,0);
        const [rows, total] = await Promise.all([
            this.prisma.xp.findMany({ where:{ guildId }, orderBy:[{ level:"desc" }, { xp:"desc" }], take: limit, skip: offset }).catch(()=>[]),
            this.prisma.xp.count({ where:{ guildId } }).catch(()=>0)
        ]);
        return { rows, total };
    }
    async getWeeklyLeaderboard(guildId, limit=10){
        const weekAgo=new Date(Date.now()-7*86400*1000);
        const rows=await this.prisma.xp.findMany({ where:{ guildId, updatedAt:{ gte: weekAgo }}, orderBy:[{ level:"desc" }, { xp:"desc" }], take: limit }).catch(()=>[]);
        const total=await this.prisma.xp.count({ where:{ guildId, updatedAt:{ gte: weekAgo }}}).catch(()=>0);
        return { rows, total, period:"weekly" };
    }
    async getMonthlyLeaderboard(guildId, limit=10){
        const monthAgo=new Date(Date.now()-30*86400*1000);
        const rows=await this.prisma.xp.findMany({ where:{ guildId, updatedAt:{ gte: monthAgo }}, orderBy:[{ level:"desc" }, { xp:"desc" }], take: limit }).catch(()=>[]);
        const total=await this.prisma.xp.count({ where:{ guildId, updatedAt:{ gte: monthAgo }}}).catch(()=>0);
        return { rows, total, period:"monthly" };
    }
    async getCard(guildId, userId){
        const rank=await this.getRank(guildId, userId);
        if(!rank) return null;
        const streak=await this.getStreak(guildId, userId).catch(()=>null);
        const prog=this.formatProgress(rank.xp, rank.level);
        return { ...rank, streak: streak?.streak||0, longest: streak?.longest||0, progress: prog };
    }
    async prestige(guildId, userId){
        const row=await this.prisma.xp.findUnique({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>null);
        if(!row) return { success:false, reason:"No XP" };
        if(row.level<50) return { success:false, reason:"Need level 50 to prestige" };
        await this.prisma.xp.update({ where:{ guildId_userId:{ guildId, userId }}, data:{ level:0, xp:0 }}).catch(()=>null);
        // Grant prestige achievement/economy
        await this.client?.services?.achievements?.checkAndUnlock(guildId, userId, { level:50 }).catch(()=>{});
        await this.client?.services?.economy?.add(guildId, userId, 1000).catch(()=>{});
        await this.client?.services?.audit?.log(guildId,{ actorId:userId, action:"prestige", category:"leveling", details:{ oldLevel: row.level }}).catch(()=>{});
        return { success:true, oldLevel: row.level };
    }
    formatProgress(xp, level){
        const need = lvlXp(level);
        const pct = Math.min(100, Math.floor((xp/need)*100));
        const filled = Math.floor(pct/10);
        const bar = "▰".repeat(filled) + "▱".repeat(10-filled);
        return { need, pct, bar };
    }
}
