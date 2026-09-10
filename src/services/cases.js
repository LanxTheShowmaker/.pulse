export class CasesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async nextCaseNumber(guildId) {
        const last = await this.prisma.case.findFirst({
            where: { guildId },
            orderBy: { caseNumber: "desc" },
            select: { caseNumber: true },
        });
        return (last?.caseNumber ?? 0) + 1;
    }
    async create(input) {
        for (let attempt = 0; attempt < 3; attempt++) {
            const caseNumber = await this.nextCaseNumber(input.guildId);
            try {
                return await this.prisma.case.create({ data: { ...input, caseNumber } });
            } catch (e) {
                if (e?.code === "P2002" && attempt < 2) continue;
                throw e;
            }
        }
    }
    async get(guildId, caseNumber) {
        return this.prisma.case.findUnique({ where: { guildId_caseNumber: { guildId, caseNumber } } });
    }
    async byTarget(guildId, targetId, limit = 25) {
        return this.prisma.case.findMany({ where: { guildId, targetId }, orderBy: { createdAt: "desc" }, take: limit });
    }
    async byModerator(guildId, moderatorId, limit = 25) {
        return this.prisma.case.findMany({ where: { guildId, moderatorId }, orderBy: { createdAt: "desc" }, take: limit });
    }
    async recent(guildId, limit=25){
        return this.prisma.case.findMany({ where:{ guildId }, orderBy:{ createdAt:"desc" }, take: limit });
    }
    async count(guildId){
        return this.prisma.case.count({ where:{ guildId }}).catch(()=>0);
    }
    async history(guildId, targetId){
        return this.byTarget(guildId, targetId, 50);
    }
    async infractionCount(guildId, targetId, windowMs=null){
        const where={ guildId, targetId, action:{ in:["WARN","TIMEOUT","KICK","BAN"] }, resolved:false };
        if(windowMs){
            where.createdAt={ gte: new Date(Date.now()-windowMs) };
        }
        return this.prisma.case.count({ where }).catch(()=>0);
    }
    async stats(guildId){
        try{
            const total=await this.prisma.case.count({ where:{ guildId }});
            const byAction=await this.prisma.case.groupBy({ by:["action"], where:{ guildId }, _count:{_all:true }}).catch(()=>[]);
            const byModerator=await this.prisma.case.groupBy({ by:["moderatorId"], where:{ guildId }, _count:{_all:true }, orderBy:{ _count:{ moderatorId:"desc" }}, take:5 }).catch(()=>[]);
            return { total, byAction, topMods: byModerator };
        }catch{ return { total:0, byAction:[], topMods:[] }; }
    }
    async resolve(guildId, caseNumber, by) {
        const existing = await this.get(guildId, caseNumber);
        if (!existing || existing.resolved)
            return existing;
        return this.prisma.case.update({
            where: { guildId_caseNumber: { guildId, caseNumber } },
            data: { resolved: true, resolvedById: by.id, resolvedByTag: by.tag, resolvedAt: new Date() },
        });
    }
    async edit(guildId, caseNumber, patch){
        const existing=await this.get(guildId, caseNumber);
        if(!existing) return null;
        const data={};
        if(patch.reason!==undefined) data.reason=String(patch.reason).slice(0,500);
        if(patch.duration!==undefined) data.duration=String(patch.duration);
        if(patch.metadata!==undefined) data.metadata=JSON.stringify(patch.metadata).slice(0,2000);
        return this.prisma.case.update({ where:{ guildId_caseNumber:{ guildId, caseNumber }}, data });
    }
    // Notes
    async addNote(guildId, targetId, authorId, authorTag, content, caseNumber=null){
        return this.prisma.caseNote.create({ data:{ guildId, targetId, authorId, authorTag, content: String(content).slice(0,1000), caseNumber: caseNumber?Number(caseNumber):null }});
    }
    async getNotes(guildId, targetId, limit=25){
        return this.prisma.caseNote.findMany({ where:{ guildId, targetId }, orderBy:{ createdAt:"desc" }, take: limit }).catch(()=>[]);
    }
    async getCaseNotes(guildId, caseNumber){
        return this.prisma.caseNote.findMany({ where:{ guildId, caseNumber: Number(caseNumber) }, orderBy:{ createdAt:"desc" }}).catch(()=>[]);
    }
    // Appeals
    async createAppeal(guildId, caseNumber, appellantId, reason){
        return this.prisma.appeal.create({ data:{ guildId, caseNumber:Number(caseNumber), appellantId, reason: String(reason).slice(0,1000) }});
    }
    async listAppeals(guildId, status=null){
        const where={ guildId }; if(status) where.status=status;
        return this.prisma.appeal.findMany({ where, orderBy:{ createdAt:"desc" }, take:25 }).catch(()=>[]);
    }
    async reviewAppeal(guildId, appealId, reviewer, status, note=null){
        return this.prisma.appeal.update({ where:{ id: appealId }, data:{ status, reviewerId: reviewer.id, reviewerTag: reviewer.tag }}).catch(()=>null);
    }
    async reviewAppealByCase(guildId, caseNumber, reviewer, status, reason=null){
        const appeal = await this.prisma.appeal.findFirst({ where: { guildId, caseNumber } });
        if (!appeal) return null;
        return this.reviewAppeal(guildId, appeal.id, reviewer, status, reason);
    }
    // Expiration handling: find cases with durationMs and not resolved and past
    async expiredPunishments(guildId){
        const now=Date.now();
        const cases=await this.prisma.case.findMany({ where:{ guildId, resolved:false, durationMs:{ not:null }}, take:50 }).catch(()=>[]);
        return cases.filter(c=> {
            const ms=Number(c.durationMs||0);
            const created=c.createdAt.getTime();
            return now - created >= ms;
        });
    }
}
