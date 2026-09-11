import { EmbedBuilder } from "@discordjs/builders";
import { Theme, Brand } from "../design/theme.js";

export class SuggestionService {
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }

    async create(guild, channel, author, content) {
        const suggestion = await this.prisma.suggestion.create({
            data: {
                guildId: guild.id,
                channelId: channel.id,
                authorId: author.id,
                content,
            },
        });

        const embed = new EmbedBuilder()
            .setColor(Theme.accent)
            .setTitle(`Suggestion #${suggestion.id.slice(0, 6)}`)
            .setDescription(content)
            .addFields({ name: "Author", value: `<@${author.id}>`, inline: true })
            .setFooter({ text: Brand.footer })
            .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        await msg.react("✅").catch(() => {});
        await msg.react("❌").catch(() => {});

        await this.prisma.suggestion.update({ where: { id: suggestion.id }, data: { messageId: msg.id } });
        return { suggestion, message: msg };
    }
}
