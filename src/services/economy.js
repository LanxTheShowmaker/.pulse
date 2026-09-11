import { logger } from "../core/logger.js";
const JOBS = [
    { id:"miner", name:"Miner", payout:[30,60], cooldown: 3600*1000, description:"Mine minerals" },
    { id:"guard", name:"Guardian", payout:[40,80], cooldown: 3600*1000, description:"Guard the gates" },
    { id:"scribe", name:"Scribe", payout:[25,50], cooldown: 3600*1000, description:"Copy sacred texts" },
    { id:"healer", name:"Healer", payout:[35,70], cooldown: 3600*1000, description:"Heal the wounded" },
];
const DAILY_COOLDOWN=24*3600*1000, WEEKLY_COOLDOWN=7*24*3600*1000;
const dailyMap=new Map(), weeklyMap=new Map(), jobMap=new Map();
function sweepMap(map, windowMs){
    const cutoff=Date.now()-2*windowMs;
    for(const [k,v] of map){ if((typeof v==="number" ? v : v?.at ?? 0) < cutoff) map.delete(k); }
}
setInterval(()=>{ sweepMap(dailyMap, DAILY_COOLDOWN); sweepMap(weeklyMap, WEEKLY_COOLDOWN); }, 3600*1000).unref?.();
setInterval(()=>{ const now=Date.now(); for(const [k,v] of jobMap){ const at = typeof v==="number" ? v : v?.at ?? 0; const job = JOBS.find(j=>k.endsWith(`:${j.id}`)); const w = job?.cooldown ?? 3600*1000; if(now-at > 2*w) jobMap.delete(k); } }, 3600*1000).unref?.();
export class EconomyService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async getConfig(guildId){
        try{
            let cfg=await this.prisma.economyConfig.findUnique({ where:{ guildId }}).catch(()=>null);
            if(!cfg) cfg=await this.prisma.economyConfig.create({ data:{ guildId }}).catch(()=>({ guildId, dailyAmount:100, weeklyAmount:500, shopEnabled:true, tradingEnabled:true, jobsEnabled:true }));
            return cfg;
        }catch{ return { dailyAmount:100, weeklyAmount:500, shopEnabled:true, tradingEnabled:true, jobsEnabled:true }; }
    }
    async add(guildId, userId, amount, meta={ type:"adjust", actorId:null }){
        const type = meta.type||"adjust";
        const metaStr = meta.meta? JSON.stringify(meta.meta): null;
        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.economy.findUnique({ where:{ guildId_userId:{ guildId, userId }}});
            if(row){
                return tx.economy.update({ where:{ guildId_userId:{ guildId, userId }}, data:{ balance:{ increment: amount }}});
            }
            return tx.economy.create({ data:{ guildId, userId, balance: Math.max(0, amount) }});
        });
        await this.prisma.economyTransaction.create({ data:{ guildId, userId, type, amount, balanceAfter: updated.balance, meta: metaStr }});
        const next = updated.balance;
        await this.client?.services?.audit?.log(guildId,{ actorId: meta.actorId||userId, targetId:userId, action:`economy_${type}`, category:"economy", details:{ amount, balance:next }}).catch(()=>{});
        if(next>=1000) await this.client?.services?.achievements?.checkAndUnlock(guildId, userId, { balance:next }).catch(()=>{});
        return next;
    }
    async get(guildId, userId){ const r=await this.prisma.economy.findUnique({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>null); return r?.balance ?? 0; }
    async set(guildId, userId, amount, actorId=null){
        const next = Math.max(0, amount|0);
        await this.prisma.economy.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ balance: next }, create:{ guildId, userId, balance: next }});
        await this.prisma.economyTransaction.create({ data:{ guildId, userId, type:"admin_set", amount: next, balanceAfter: next, meta: JSON.stringify({ actorId })}});
        return next;
    }
    async getLeaderboard(guildId, limit=10, offset=0){
        limit = Math.min(Math.max(limit,1),25);
        offset = Math.max(offset,0);
        const [rows, total] = await Promise.all([
            this.prisma.economy.findMany({ where:{ guildId }, orderBy:{ balance:"desc" }, take: limit, skip: offset }).catch(()=>[]),
            this.prisma.economy.count({ where:{ guildId } }).catch(()=>0)
        ]);
        return { rows, total };
    }
    async getHistory(guildId, userId, limit=10){
        return this.prisma.economyTransaction.findMany({ where:{ guildId, userId }, orderBy:{ createdAt:"desc" }, take: limit }).catch(()=>[]);
    }
    async handleMessage(message){
        if(message.author.bot || !message.guild) return;
        if(Math.random()>0.1) return;
        await this.add(message.guild.id, message.author.id, Math.floor(Math.random()*10)+5, { type:"message_reward" }).catch(()=>{});
    }
    async _checkTxCooldown(guildId, userId, type, windowMs, jobId=null){
        try{
            const since=new Date(Date.now()-windowMs);
            if(type==="job" && jobId){
                const recent=await this.prisma.economyTransaction.findMany({ where:{ guildId, userId, type, createdAt:{ gte: since }}, orderBy:{ createdAt:"desc" }, take:10 }).catch(()=>[]);
                for(const tx of recent){ try{ const m=tx.meta?JSON.parse(tx.meta):null; if(m?.jobId===jobId) return tx; }catch{} }
                return null;
            }
            return await this.prisma.economyTransaction.findFirst({ where:{ guildId, userId, type, createdAt:{ gte: since }}, orderBy:{ createdAt:"desc" }}).catch(()=>null);
        }catch{ return null; }
    }
    // Daily / Weekly
    async claimDaily(guildId, userId){
        const now=Date.now(); const key=`${guildId}:${userId}`; const last=dailyMap.get(key)||0;
        if(now-last < DAILY_COOLDOWN) return { success:false, next: last+DAILY_COOLDOWN, remaining: (last+DAILY_COOLDOWN)-now };
        dailyMap.set(key, now);
        const lastTx=await this._checkTxCooldown(guildId, userId, "daily", DAILY_COOLDOWN);
        if(lastTx){ const at=new Date(lastTx.createdAt).getTime(); dailyMap.set(key, at); return { success:false, next: at+DAILY_COOLDOWN, remaining: (at+DAILY_COOLDOWN)-now }; }
        const cfg=await this.getConfig(guildId);
        let bal;
        try {
            bal=await this.add(guildId, userId, cfg.dailyAmount, { type:"daily" });
        } catch (e) {
            dailyMap.delete(key);
            throw e;
        }
        return { success:true, amount: cfg.dailyAmount, balance: bal };
    }
    async claimWeekly(guildId, userId){
        const now=Date.now(); const key=`${guildId}:${userId}`; const last=weeklyMap.get(key)||0;
        if(now-last < WEEKLY_COOLDOWN) return { success:false, next: last+WEEKLY_COOLDOWN };
        weeklyMap.set(key, now);
        const lastTx=await this._checkTxCooldown(guildId, userId, "weekly", WEEKLY_COOLDOWN);
        if(lastTx){ const at=new Date(lastTx.createdAt).getTime(); weeklyMap.set(key, at); return { success:false, next: at+WEEKLY_COOLDOWN }; }
        const cfg=await this.getConfig(guildId);
        let bal;
        try {
            bal=await this.add(guildId, userId, cfg.weeklyAmount, { type:"weekly" });
        } catch (e) {
            weeklyMap.delete(key);
            throw e;
        }
        return { success:true, amount: cfg.weeklyAmount, balance: bal };
    }
    // Jobs
    getJobs(){ return JOBS; }
    async work(guildId, userId, jobId){
        const job=JOBS.find(j=>j.id===jobId);
        if(!job) return { success:false, reason:"Unknown job" };
        const cfg=await this.getConfig(guildId);
        if(!cfg.jobsEnabled) return { success:false, reason:"Jobs disabled" };
        const key=`${guildId}:${userId}:${jobId}`; const last=jobMap.get(key)||0;
        if(Date.now()-last < job.cooldown) return { success:false, reason:`Cooldown`, next: last+job.cooldown };
        jobMap.set(key, Date.now());
        const lastTx=await this._checkTxCooldown(guildId, userId, "job", job.cooldown, jobId);
        if(lastTx){ const at=new Date(lastTx.createdAt).getTime(); jobMap.set(key, at); return { success:false, reason:`Cooldown`, next: at+job.cooldown }; }
        const payout=Math.floor(Math.random()*(job.payout[1]-job.payout[0]+1))+job.payout[0];
        let bal;
        try {
            bal=await this.add(guildId, userId, payout, { type:"job", meta:{ jobId }});
        } catch (e) {
            jobMap.delete(key);
            throw e;
        }
        return { success:true, job, payout, balance: bal };
    }
    // Trading / Gifting
    async gift(guildId, fromId, toId, amount){
        if(fromId===toId) return { success:false, reason:"Cannot gift yourself" };
        if(!Number.isInteger(amount) || amount<1) return { success:false, reason:"Invalid amount" };
        const cfg=await this.getConfig(guildId);
        if(!cfg.tradingEnabled) return { success:false, reason:"Trading disabled" };
        const result = await this.prisma.$transaction(async (tx)=>{
            const debit=await tx.economy.updateMany({ where:{ guildId, userId:fromId, balance:{ gte: amount }}, data:{ balance:{ decrement: amount }}});
            if(debit.count===0) return { ok:false };
            const sender=await tx.economy.findUnique({ where:{ guildId_userId:{ guildId, userId:fromId }}}).catch(()=>null);
            await tx.economy.upsert({ where:{ guildId_userId:{ guildId, userId:toId }}, update:{ balance:{ increment: amount }}, create:{ guildId, userId:toId, balance: Math.max(0, amount) }});
            const recipient=await tx.economy.findUnique({ where:{ guildId_userId:{ guildId, userId:toId }}}).catch(()=>null);
            await tx.economyTransaction.create({ data:{ guildId, userId:fromId, type:"gift_out", amount:-amount, balanceAfter: sender?.balance ?? 0, meta: JSON.stringify({ to:toId })}});
            await tx.economyTransaction.create({ data:{ guildId, userId:toId, type:"gift_in", amount, balanceAfter: recipient?.balance ?? amount, meta: JSON.stringify({ from:fromId })}});
            return { ok:true };
        });
        if(!result.ok) return { success:false, reason:`Insufficient funds` };
        await this.client?.services?.audit?.log(guildId,{ actorId:fromId, targetId:toId, action:"gift", category:"economy", details:{ amount }}).catch(()=>{});
        return { success:true, amount };
    }
    async tradePropose(guildId, fromId, toId, offerAmount, requestItemName){
        // Simplified: for now, just gift + shop item check
        return this.gift(guildId, fromId, toId, offerAmount);
    }
    // Shop (preserve)
    async getShopItems(guildId){
        try{
            if(!this.prisma.shopItem) return [];
            return await this.prisma.shopItem.findMany({ where:{ guildId }, orderBy:{ price:"asc" } });
        }catch(e){ logger.error("economy","getShopItems failed",e); return []; }
    }
    async getShopItem(guildId, name){
        try{
            if(!this.prisma.shopItem) return null;
            return await this.prisma.shopItem.findUnique({ where:{ guildId_name:{ guildId, name } } }).catch(()=>null);
        }catch(e){ return null; }
    }
    async createShopItem(guildId, { name, description, price, roleId, emoji, stock, rarity }){
        if(!this.prisma.shopItem) throw new Error("ShopItem model not available — run prisma generate");
        const cleanName = String(name).trim().slice(0,32);
        if(!cleanName) throw new Error("Item name required");
        if(!Number.isInteger(price) || price < 1 || price > 100000) throw new Error("Price must be 1–100000");
        // rarity stored in description prefix if needed
        let desc = description?.slice(0,200) ?? null;
        if(rarity) desc = `[${rarity}] `+(desc||"");
        return await this.prisma.shopItem.create({ data:{ guildId, name: cleanName, description: desc, price, roleId: roleId ?? null, emoji: emoji?.slice(0,32) ?? null, stock: stock ?? null }});
    }
    async deleteShopItem(guildId, name){
        if(!this.prisma.shopItem) throw new Error("ShopItem model not available");
        return await this.prisma.shopItem.delete({ where:{ guildId_name:{ guildId, name } }}).catch(()=>null);
    }
    async buyItem(guildId, userId, itemName, member){
        const item = await this.getShopItem(guildId, itemName);
        if(!item) return { success:false, reason:"Item not found" };
        if(item.stock !== null && item.stock !== undefined && item.stock <= 0) return { success:false, reason:"Out of stock" };
        const cfg=await this.getConfig(guildId);
        if(!cfg.shopEnabled) return { success:false, reason:"Shop disabled" };
        const stockLimited = item.stock !== null && item.stock !== undefined;
        let newBal;
        try{
            const out = await this.prisma.$transaction(async (tx)=>{
                if(stockLimited){
                    const stockRes=await tx.shopItem.updateMany({ where:{ id:item.id, stock:{ gt:0 }}, data:{ stock:{ decrement:1 }}});
                    if(stockRes.count===0){ const err=new Error("Out of stock"); err.code="OUT_OF_STOCK"; throw err; }
                }
                const balRes=await tx.economy.updateMany({ where:{ guildId, userId, balance:{ gte: item.price }}, data:{ balance:{ decrement: item.price }}});
                if(balRes.count===0){ const err=new Error(`Not enough coins — need **${item.price}**`); err.code="INSUFFICIENT_FUNDS"; throw err; }
                const row=await tx.economy.findUnique({ where:{ guildId_userId:{ guildId, userId }}});
                if(this.prisma.shopInventory){
                    await tx.shopInventory.upsert({ where:{ guildId_userId_itemId:{ guildId, userId, itemId:item.id }}, update:{ quantity:{ increment:1 }}, create:{ guildId, userId, itemId:item.id, quantity:1 }});
                }
                await tx.economyTransaction.create({ data:{ guildId, userId, type:"shop_buy", amount:-item.price, balanceAfter: row?.balance ?? 0, meta: JSON.stringify({ item:item.name })}});
                return row?.balance ?? 0;
            });
            newBal=out;
        }catch(e){
            if(e?.code==="OUT_OF_STOCK") return { success:false, reason:"Out of stock" };
            if(e?.code==="INSUFFICIENT_FUNDS") return { success:false, reason:`Not enough coins — need **${item.price}**` };
            throw e;
        }
        let roleGranted=false; let roleError=null; let refunded=false;
        if(item.roleId && member){
            try{
                if(member.guild?.roles?.cache?.has(item.roleId) && !member.roles.cache.has(item.roleId)){
                    await member.roles.add(item.roleId).catch(e=>{ roleError=e.message; });
                    roleGranted = !roleError && member.roles.cache.has(item.roleId);
                    if(!roleGranted && !roleError){
                        await member.roles.add(item.roleId);
                        roleGranted=true;
                    }
                } else if(member.roles.cache.has(item.roleId)){
                    roleGranted=true;
                }
            }catch(e){ roleError=e?.message ?? String(e); logger.error("economy","role grant failed",e); }
            if(roleError && !roleGranted){
                try{ await this.add(guildId, userId, item.price, { type:"refund", meta:{ item:item.name, reason:roleError }}); refunded=true; newBal+=item.price; }catch(re){ logger.error("economy","refund failed",re); }
            }
        }
        await this.client?.services?.audit?.log(guildId,{ actorId:userId, action:"shop_buy", category:"economy", details:{ item:item.name, price:item.price }}).catch(()=>{});
        return { success:true, item, newBalance:newBal, roleGranted, roleError: roleError ? (refunded ? `${roleError} (refunded)` : roleError) : roleError, ...(refunded?{ refunded:true }: {}) };
    }
    // Admin
    async adminAdd(guildId, userId, amount, actorId){ return this.add(guildId, userId, amount, { type:"admin_add", actorId, meta:{ actorId }}); }
    async adminRemove(guildId, userId, amount, actorId){ return this.add(guildId, userId, -amount, { type:"admin_remove", actorId, meta:{ actorId }}); }
}
