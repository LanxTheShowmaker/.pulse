import { logger } from "../core/logger.js";
export const DEFAULT_ACHIEVEMENTS = [
    { key:"first_message", name:"First Words", description:"Send your first message", category:"leveling", rewards:{ xp:50, coins:10 }, conditions:{ messages:1 } },
    { key:"level_5", name:"Rising Star", description:"Reach level 5", category:"leveling", rewards:{ coins:100 }, conditions:{ level:5 } },
    { key:"level_10", name:"Level 10", description:"Reach level 10", category:"leveling", rewards:{ coins:250, xp:200 }, conditions:{ level:10 } },
    { key:"level_25", name:"Level 25", description:"Reach level 25", category:"leveling", rewards:{ coins:1000 }, conditions:{ level:25 } },
    { key:"rich_1000", name:"Coin Keeper", description:"Hold 1,000 coins", category:"economy", rewards:{ xp:100 }, conditions:{ balance:1000 } },
    { key:"rich_5000", name:"Treasurer", description:"Hold 5,000 coins", category:"economy", rewards:{ xp:300 }, conditions:{ balance:5000 } },
    { key:"ticket_first", name:"First Ticket", description:"Open your first ticket", category:"tickets", rewards:{ coins:50 }, conditions:{ tickets:1 } },
    { key:"helper_10", name:"Helpful Hands", description:"Close 10 tickets (staff)", category:"tickets", rewards:{ coins:500 }, conditions:{ ticketsClosed:10 } },
    { key:"mod_first", name:"First Moderation", description:"Perform a moderation action", category:"moderation", rewards:{ coins:20 }, conditions:{ modActions:1 } },
    { key:"streak_7", name:"Week Warrior", description:"7 day XP streak", category:"leveling", rewards:{ coins:700 }, conditions:{ streak:7 } },
];
const SEED_CACHE_TTL = 5*60*1000;
const seedCache = new Map(); // guildId -> timestamp of last successful seed

export class AchievementService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async ensureDefaults(guildId=null){
        const key = guildId ?? "__global__";
        const last = seedCache.get(key) || 0;
        if(Date.now()-last < SEED_CACHE_TTL) return;
        for(const def of DEFAULT_ACHIEVEMENTS){
            try{
                await this.prisma.achievement.upsert({ where:{ guildId_key:{ guildId: guildId, key: def.key }}, update:{}, create:{ guildId, key: def.key, name: def.name, description: def.description, category: def.category, rewards: JSON.stringify(def.rewards), conditions: JSON.stringify(def.conditions) }});
            }catch(e){ logger.error("achievements","ensure failed",e); }
        }
        seedCache.set(key, Date.now());
    }
    async getForGuild(guildId){
        await this.ensureDefaults(guildId);
        try{
            const list = await this.prisma.achievement.findMany({ where:{ OR:[{ guildId }, { guildId:null }]}, orderBy:{ category:"asc" }}).catch(()=>[]);
            return list;
        }catch{ return []; }
    }
    async getUserProgress(guildId, userId){
        try{
            const all = await this.getForGuild(guildId);
            const prog = await this.prisma.userAchievement.findMany({ where:{ guildId, userId }}).catch(()=>[]);
            const map=new Map(prog.map(p=> [p.achievementId, p]));
            return all.map(a=> ({ achievement:a, progress:map.get(a.id)||null }));
        }catch(e){ logger.error("achievements","progress failed",e); return []; }
    }
    async _claim(guildId, userId, achievementId){
        // Try to flip an existing locked row first.
        try{
            const res = await this.prisma.userAchievement.updateMany({ where:{ guildId, userId, achievementId, unlocked:false }, data:{ unlocked:true, unlockedAt:new Date(), progress:1 }});
            if(res.count===1) return true;
        }catch(e){ logger.error("achievements","claim update failed",e); }
        // No locked row — try to create the unlock row.
        try{
            await this.prisma.userAchievement.create({ data:{ guildId, userId, achievementId, unlocked:true, unlockedAt:new Date(), progress:1 }});
            return true;
        }catch(e){
            if(e?.code==="P2002"){
                // Lost the create race — try to claim the winner's locked row.
                try{
                    const res = await this.prisma.userAchievement.updateMany({ where:{ guildId, userId, achievementId, unlocked:false }, data:{ unlocked:true, unlockedAt:new Date(), progress:1 }});
                    return res.count===1;
                }catch(ie){ logger.error("achievements","claim race retry failed",ie); return false; }
            }
            logger.error("achievements","claim create failed",e);
            return false;
        }
    }
    async checkAndUnlock(guildId, userId, context){
        // context: { level, balance, messages, tickets, ticketsClosed, modActions, streak }
        const defs = await this.getForGuild(guildId);
        const unlocked=[];
        for(const def of defs){
            try{
                const cond = JSON.parse(def.conditions||"{}");
                let met=false;
                if(cond.level && context.level!==undefined) met=context.level>=cond.level;
                else if(cond.balance && context.balance!==undefined) met=context.balance>=cond.balance;
                else if(cond.streak && context.streak!==undefined) met=context.streak>=cond.streak;
                else if(cond.tickets && context.tickets!==undefined) met=context.tickets>=cond.tickets;
                else if(cond.messages && context.messages!==undefined) met=context.messages>=cond.messages;
                else if(cond.modActions && context.modActions!==undefined) met=context.modActions>=cond.modActions;
                else if(cond.ticketsClosed && context.ticketsClosed!==undefined) met=context.ticketsClosed>=cond.ticketsClosed;
                if(!met) continue;
                const claimed = await this._claim(guildId, userId, def.id);
                if(!claimed) continue;
                // Grant rewards only to the single claim winner
                const rewards = JSON.parse(def.rewards||"{}");
                if(rewards.xp) await this.prisma.xp.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ xp:{ increment: rewards.xp }}, create:{ guildId, userId, xp: rewards.xp, level:0 }}).catch((e)=>{ logger.error("achievements","xp reward failed",e); });
                if(rewards.coins) await this.client.services?.economy?.add(guildId, userId, rewards.coins, { type:"achievement_reward", meta:{ achievementId:def.id }}).catch((e)=>{ logger.error("achievements","coin reward failed",e); });
                if(rewards.roleId){
                    try{ const g=this.client.guilds.cache.get(guildId); const m=await g?.members.fetch(userId).catch(()=>null); if(m && g.roles.cache.has(rewards.roleId)) await m.roles.add(rewards.roleId).catch(()=>{}); }catch{}
                }
                unlocked.push(def);
            }catch(e){ logger.error("achievements","check unlock failed",e); }
        }
        return unlocked;
    }
    async leaderboard(guildId, limit=10){
        try{
            const rows = await this.prisma.userAchievement.groupBy({ by:["userId"], where:{ guildId, unlocked:true }, _count:{ _all:true }, orderBy:{ _count:{ userId:"desc" }}, take: limit }).catch(()=>[]);
            return rows.map(r=>({ userId:r.userId, count:r._count._all }));
        }catch{ return []; }
    }
}
