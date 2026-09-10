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

export class AchievementService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async ensureDefaults(guildId=null){
        for(const def of DEFAULT_ACHIEVEMENTS){
            try{
                await this.prisma.achievement.upsert({ where:{ guildId_key:{ guildId: guildId, key: def.key }}, update:{}, create:{ guildId, key: def.key, name: def.name, description: def.description, category: def.category, rewards: JSON.stringify(def.rewards), conditions: JSON.stringify(def.conditions) }});
            }catch(e){ logger.error("achievements","ensure failed",e); }
        }
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
                const existing = await this.prisma.userAchievement.findUnique({ where:{ guildId_userId_achievementId:{ guildId, userId, achievementId:def.id }}}).catch(()=>null);
                if(existing?.unlocked) continue;
                await this.prisma.userAchievement.upsert({ where:{ guildId_userId_achievementId:{ guildId, userId, achievementId:def.id }}, update:{ unlocked:true, unlockedAt:new Date(), progress:1 }, create:{ guildId, userId, achievementId:def.id, unlocked:true, unlockedAt:new Date(), progress:1 }});
                // Grant rewards
                const rewards = JSON.parse(def.rewards||"{}");
                if(rewards.xp) await this.prisma.xp.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ xp:{ increment: rewards.xp }}, create:{ guildId, userId, xp: rewards.xp, level:0 }}).catch(()=>{});
                if(rewards.coins) await this.prisma.economy.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ balance:{ increment: rewards.coins }}, create:{ guildId, userId, balance: rewards.coins }}).catch(()=>{});
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
