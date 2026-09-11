import { EmbedBuilder } from "@discordjs/builders";
import { Theme } from "../design/theme.js";
export class AfkService {
    prisma; client;
    constructor(prisma, client){ this.prisma=prisma; this.client=client; }
    async set(guildId, userId, reason){ await this.prisma.afk.upsert({ where:{ guildId_userId:{ guildId, userId }}, update:{ reason, since:new Date() }, create:{ guildId, userId, reason }}); }
    async clear(guildId, userId){ await this.prisma.afk.delete({ where:{ guildId_userId:{ guildId, userId }}}).catch(()=>{}); }
    async handleMessage(message){
        if(message.author.bot || !message.guild) return;
        // Clear AFK if author was AFK
        const self = await this.prisma.afk.findUnique({ where:{ guildId_userId:{ guildId:message.guild.id, userId:message.author.id }}}).catch(()=>null);
        if(self){
            await this.clear(message.guild.id, message.author.id);
            await message.reply({ embeds:[new EmbedBuilder().setColor(Theme.success).setDescription(`Welcome back <@${message.author.id}> — AFK cleared.`)] }).catch(()=>{});
        }
        // Check mentions
        for(const [id, user] of message.mentions.users){
            const afk = await this.prisma.afk.findUnique({ where:{ guildId_userId:{ guildId:message.guild.id, userId:id }}}).catch(()=>null);
            if(afk){
                const embed = new EmbedBuilder().setColor(Theme.muted).setDescription(`**${user.tag}** is AFK: ${afk.reason ?? "AFK"} • <t:${Math.floor(afk.since.getTime()/1000)}:R>`);
                await message.reply({ embeds:[embed] }).catch(()=>{});
            }
        }
    }
}
