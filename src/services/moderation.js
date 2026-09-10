import { GuildMember } from "discord.js";
import { userTag } from "../design/format.js";
import { logger } from "../core/logger.js";
const DEFAULT_THRESHOLDS = { warn: 3, timeout: 5, kick: 7, ban: 10 };
export class ModerationService {
    prisma;
    cases;
    logging;
    client;
    constructor(prisma, cases, logging, client=null) {
        this.prisma = prisma;
        this.cases = cases;
        this.logging = logging;
        this.client = client;
        // Expiration checker every 60s
        setInterval(()=> this.checkExpirations().catch(()=>{}), 60_000);
    }
    setClient(client){ this.client=client; }
    async record(guild, target, moderator, action, reason, duration) {
        const created = await this.cases.create({
            guildId: guild.id,
            targetId: target.id,
            targetTag: userTag(target instanceof GuildMember ? target.user : target),
            moderatorId: moderator.id,
            moderatorTag: userTag(moderator),
            action,
            reason,
            duration: duration?.label,
            durationMs: duration?.ms,
        });
        await this.logging.logCase(created).catch((e) => logger.error("moderation", "case log failed", e));
        // Audit & automation via client.services if available
        try {
            const audit = this.client?.services?.audit ?? null;
            if (audit) audit.log(guild.id, { actorId: moderator.id, targetId: target.id, action: action.toLowerCase(), category: "moderation", details: { caseNumber: created.caseNumber, reason } }).catch(() => {});
            this.client?.services?.automation?.trigger(guild.id, "moderationCase", { caseNumber: created.caseNumber, action, targetId: target.id, moderatorId: moderator.id }).catch(() => {});
        } catch {}
        return created;
    }
    async ban(guild, target, moderator, reason, days = 0) {
        const c = await this.record(guild, target, moderator, "BAN", reason);
        await guild.bans
            .create(target.id, { reason: `${reason ?? "No reason"} · Case #${c.caseNumber}`, deleteMessageSeconds: days * 86400 })
            .catch((e) => logger.error("moderation", "ban failed", e));
        return c;
    }
    async unban(guild, userId, userTagStr, moderator, reason) {
        const c = await this.cases.create({ guildId: guild.id, targetId: userId, targetTag: userTagStr, moderatorId: moderator.id, moderatorTag: userTag(moderator), action: "UNBAN", reason });
        await guild.bans.remove(userId, reason).catch((e) => logger.error("moderation", "unban failed", e));
        await this.logging.logCase(c).catch(() => { });
        return c;
    }
    async kick(guild, target, moderator, reason) {
        const c = await this.record(guild, target, moderator, "KICK", reason);
        await target.kick(reason).catch((e) => logger.error("moderation", "kick failed", e));
        return c;
    }
    async timeout(target, moderator, ms, reason) {
        const c = await this.record(target.guild, target, moderator, "TIMEOUT", reason, { label: timeLabel(ms), ms });
        await target.disableCommunicationUntil(new Date(Date.now() + Number(ms))).catch((e) => logger.error("moderation", "timeout failed", e));
        return c;
    }
    async warn(guild, target, moderator, reason) {
        const c = await this.record(guild, target, moderator, "WARN", reason);
        // Check escalation
        await this.checkEscalation(guild, target).catch(()=>{});
        return c;
    }
    async note(guild, target, moderator, reason) {
        return this.record(guild, target, moderator, "NOTE", reason);
    }
    // V5: thresholds
    async getThresholds(guildId){
        try{
            const cfg = await this.prisma.guildConfig.findUnique({ where:{ guildId }}).catch(()=>null);
            if(!cfg) return DEFAULT_THRESHOLDS;
            const automod = JSON.parse(cfg.automod||"{}");
            return { ...DEFAULT_THRESHOLDS, ...(automod.thresholds||{}) };
        }catch{ return DEFAULT_THRESHOLDS; }
    }
    async setThresholds(guildId, patch){
        const cfg = await this.prisma.guildConfig.findUnique({ where:{ guildId }}).catch(()=>null);
        if(!cfg) return;
        const automod = JSON.parse(cfg.automod||"{}");
        automod.thresholds = { ...(automod.thresholds||DEFAULT_THRESHOLDS), ...patch };
        await this.prisma.guildConfig.update({ where:{ guildId }, data:{ automod: JSON.stringify(automod) }}).catch(()=>{});
        return automod.thresholds;
    }
    async checkEscalation(guild, target){
        const thresholds=await this.getThresholds(guild.id);
        const count=await this.cases.infractionCount(guild.id, target.id).catch(()=>0);
        let action=null, duration=null;
        if(count >= thresholds.ban) action="ban";
        else if(count >= thresholds.kick) action="kick";
        else if(count >= thresholds.timeout) { action="timeout"; duration=10*60*1000; }
        else if(count >= thresholds.warn) { action="timeout"; duration=5*60*1000; }
        if(!action) return null;
        // Avoid auto-escalating if already recently escalated (check last case)
        const recent=await this.cases.byTarget(guild.id, target.id, 1).catch(()=>[]);
        if(recent[0]?.action===action.toUpperCase() && Date.now()-new Date(recent[0].createdAt).getTime()<60000) return null;
        // Perform escalation as system (moderator = guild.me)
        const me=guild.members.me;
        if(!me) return null;
        if(action==="ban") await this.ban(guild, target, me, `Auto-escalation: ${count} infractions`).catch(()=>{});
        else if(action==="kick") await this.kick(guild, target, me, `Auto-escalation: ${count} infractions`).catch(()=>{});
        else if(action==="timeout"){
            const member=target instanceof GuildMember ? target : await guild.members.fetch(target.id).catch(()=>null);
            if(member) await this.timeout(member, me, duration, `Auto-escalation: ${count} infractions`).catch(()=>{});
        }
        return { action, count };
    }
    async getUserHistory(guildId, targetId){
        const history=await this.cases.history(guildId, targetId).catch(()=>[]);
        const notes=await this.cases.getNotes(guildId, targetId).catch(()=>[]);
        const warns=history.filter(c=>c.action==="WARN").length;
        return { history, notes, warns, total: history.length };
    }
    async getModStats(guildId, moderatorId=null){
        if(moderatorId){
            const count=await this.prisma.case.count({ where:{ guildId, moderatorId }}).catch(()=>0);
            const recent=await this.cases.byModerator(guildId, moderatorId, 10).catch(()=>[]);
            return { count, recent };
        }
        return this.cases.stats(guildId);
    }
    async checkExpirations(){
        try{
            if(!this.client) return;
            const guildIds = await this.prisma.guildConfig.findMany({ select:{ guildId:true }}).then(r=>r.map(x=>x.guildId)).catch(()=>[]);
            for(const gid of guildIds){
                const expired=await this.cases.expiredPunishments(gid).catch(()=>[]);
                for(const c of expired){
                    if(c.action!=="TIMEOUT") continue;
                    const guild=this.client.guilds.cache.get(gid);
                    if(!guild) continue;
                    const member=await guild.members.fetch(c.targetId).catch(()=>null);
                    if(member && member.isCommunicationDisabled()){
                        await member.disableCommunicationUntil(null, "Punishment expired").catch(()=>{});
                        await this.cases.resolve(gid, c.caseNumber, { id: this.client.user.id, tag: this.client.user.tag }).catch(()=>{});
                        await this.client?.services?.audit?.log(gid,{ actorId: this.client.user.id, targetId: c.targetId, action:"timeout_expire", category:"moderation", details:{ caseNumber:c.caseNumber }}).catch(()=>{});
                    }
                }
            }
        }catch(e){ logger.error("moderation","expiration check failed",e); }
    }
}
function timeLabel(ms) {
    const seconds = Number(ms) / 1000;
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400)
        return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}
