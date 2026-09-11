import { logger } from "../core/logger.js";
export class DiagnosticsService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async check(guildId){
        const guild=this.client.guilds.cache.get(guildId);
        const out=[];
        const push=(name, status, detail, fix=null)=> out.push({ name, status, detail, fix, ts: new Date().toISOString() });
        // Discord connectivity
        if(this.client.ws?.status===0) push("Discord Gateway","OK","Connected");
        else push("Discord Gateway","WARNING","WebSocket not ready");
        // DB
        try{ await this.prisma.$queryRaw`SELECT 1`; push("Database","OK","Prisma query succeeded"); }catch(e){ push("Database","ERROR",e.message); }
        // Prisma models
        try{ await this.prisma.guildConfig.findFirst({ take:1 }); push("Prisma GuildConfig","OK",""); }catch(e){ push("Prisma GuildConfig","ERROR",e.message); }
        if(!guild){ push("Guild Cache","WARNING","Guild not in cache (maybe shard)"); return out; }
        const cfg=await this.client?.services?.settings.get(guildId).catch(()=>null);
        if(!cfg) push("GuildConfig","WARNING","No config, will auto-create","Run /autosetup");
        else push("GuildConfig","OK",`Modules: ${Object.entries(cfg.modules).filter(([k,v])=>v).map(([k])=>k).join(",")}`);
        // Permissions: bot's perms
        const me=guild.members.me;
        if(!me) push("Bot Member","WARNING","Bot member not cached");
        else {
            const needed=["ViewChannel","SendMessages","EmbedLinks","ManageRoles","BanMembers","KickMembers","ModerateMembers","ManageChannels"];
            const missing=needed.filter(p=> !me.permissions.has(p));
            if(missing.length) push("Bot Permissions","WARNING",`Missing: ${missing.join(",")}`, "Give Administrator or missing perms");
            else push("Bot Permissions","OK","Sufficient");
        }
        // Channels
        const chChecks=[["logChannelId","Log"],["modLogChannelId","Mod Log"],["welcomeChannelId","Welcome"],["goodbyeChannelId","Goodbye"]];
        for(const [fid,name] of chChecks){
            const id=cfg?.[fid];
            if(!id){ push(name+" Channel","WARNING","Not set", `Set via /settings or /config`); continue; }
            const ch=guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(()=>null);
            if(!ch) push(name+" Channel","ERROR",`Channel ${id} not found / deleted`, "Re-set");
            else if(!ch.isTextBased()) push(name+" Channel","WARNING","Channel not text");
            else push(name+" Channel","OK",`<#${id}>`);
        }
        // Roles
        const roleChecks=[["staffRoleIds","Staff roles"],["moderatorRoleIds","Mod roles"]];
        for(const [fid,name] of roleChecks){
            const ids=cfg?.[fid]||[];
            if(!ids.length) push(name,"WARNING","None set");
            else {
                const missing=ids.filter(id=> !guild.roles.cache.has(id));
                if(missing.length) push(name,"ERROR",`Missing roles: ${missing.join(",")}`);
                else push(name,"OK",`${ids.length} roles`);
            }
        }
        // Tickets
        try{
            const panels=await this.prisma.panel.findMany({ where:{ guildId }}).catch(()=>[]);
            if(!panels.length) push("Tickets Panels","WARNING","No panels configured","Run /tickets panel");
            else push("Tickets Panels","OK",`${panels.length} panels`);
            const tts=await this.prisma.ticketType.count({ where:{ guildId }}).catch(()=>0);
            if(tts===0) push("Ticket Types","WARNING","No ticket types");
            else push("Ticket Types","OK",`${tts} types`);
        }catch(e){ push("Tickets","ERROR",e.message); }
        // AutoMod
        const am=cfg?.automod;
        if(am?.enabled===false) push("AutoMod","WARNING","Disabled");
        else push("AutoMod","OK",`invite:${am?.inviteFilter} spam:${am?.spamThreshold}`);
        // Economy/Leveling
        try{ const lc=await this.prisma.levelConfig.findUnique({ where:{ guildId }}).catch(()=>null); push("Leveling Config","OK", lc?`x${lc.xpMultiplier}`:"using defaults"); }catch(e){ push("Leveling Config","ERROR",e.message); }
        try{ const ec=await this.prisma.economyConfig.findUnique({ where:{ guildId }}).catch(()=>null); push("Economy Config","OK", ec?`daily ${ec.dailyAmount}`:"defaults"); }catch(e){ push("Economy Config","ERROR",e.message); }
        // Storage
        try{
            const s=await this.prisma.$queryRaw`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`;
            push("Storage","OK",`SQLite OK`);
        }catch{ push("Storage","WARNING","Cannot estimate size"); }
        return out;
    }
    async health(guildId=null){
        const c=await this.check(guildId || this.client.guilds.cache.first()?.id).catch(()=>[]);
        const errors=c.filter(x=>x.status==="ERROR").length;
        const warns=c.filter(x=>x.status==="WARNING").length;
        let overall="OK"; if(errors>0) overall="ERROR"; else if(warns>2) overall="WARNING";
        return { overall, errors, warns, total:c.length, checks:c };
    }
}
