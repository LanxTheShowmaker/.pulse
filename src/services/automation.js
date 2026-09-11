import { logger } from "../core/logger.js";
export class AutomationService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async create(guildId, { name, trigger, conditions={}, actions=[] }){
        return this.prisma.automationRule.create({ data:{ guildId, name: name?.slice(0,80)||null, trigger, conditions: JSON.stringify(conditions), actions: JSON.stringify(actions) }});
    }
    async list(guildId){
        return this.prisma.automationRule.findMany({ where:{ guildId }, orderBy:{ createdAt:"desc" }, take: 50 }).catch(()=>[]);
    }
    async delete(guildId, id){
        return this.prisma.automationRule.delete({ where:{ id }}).catch(()=>null);
    }
    async toggle(guildId, id, enabled){
        return this.prisma.automationRule.update({ where:{ id }, data:{ enabled }}).catch(()=>null);
    }
    async trigger(guildId, event, context={}){
        const rules = await this.prisma.automationRule.findMany({ where:{ guildId, trigger:event, enabled:true }, take: 50 }).catch(()=>[]);
        for(const rule of rules){
            try{
                const cond = JSON.parse(rule.conditions||"{}");
                // Simple condition evaluation: if cond.levelMin etc
                let pass=true;
                if(cond.levelMin!==undefined && context.level!==undefined) pass = context.level >= cond.levelMin;
                if(cond.channelId && context.channelId) pass = pass && cond.channelId===context.channelId;
                if(!pass) continue;
                const actions = JSON.parse(rule.actions||"[]");
                for(const act of actions){
                    await this.executeAction(guildId, act, context);
                }
            }catch(e){ logger.error("automation","trigger failed",e); }
        }
    }
    async executeAction(guildId, act, ctx){
        const guild=this.client.guilds.cache.get(guildId);
        if(!guild) return;
        try{
            if(act.type==="give_role" && act.roleId && ctx.userId){
                const m=await guild.members.fetch(ctx.userId).catch(()=>null);
                if(m && guild.roles.cache.has(act.roleId)) await m.roles.add(act.roleId).catch(()=>{});
            } else if(act.type==="send_message" && act.channelId && act.content){
                const ch=guild.channels.cache.get(act.channelId) ?? await guild.channels.fetch(act.channelId).catch(()=>null);
                if(ch?.isTextBased()) await ch.send({ content: act.content.replace("{user}", `<@${ctx.userId}>`) }).catch(()=>{});
            } else if(act.type==="log" && act.message){
                await this.client.services?.audit?.log(guildId,{ action:"automation", category:"automation", details:{ rule:act, ctx }}).catch(()=>{});
            } else if(act.type==="transcript" && ctx.channelId){
                // Trigger ticket transcript via ticket service
                await this.client.services?.tickets?.handleTranscriptForAutomation?.(guildId, ctx.channelId).catch(()=>{});
            }
        }catch(e){ logger.error("automation","action failed",e); }
    }
}
