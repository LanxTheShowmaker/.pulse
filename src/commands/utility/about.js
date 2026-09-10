import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Theme } from "../../design/theme.js";
import { embeds } from "../../design/embeds.js";
export default {
    data: new SlashCommandBuilder().setName("about").setDescription("About this bot."),
    category:"Utility",
    async execute(interaction){
        const guild=interaction.guild;
        const client=interaction.client;
        const branding=await client.services.branding?.get(guild.id).catch(()=>null);
        const dispName=branding?.displayName || client.user.username;
        const dispIcon=branding?.avatarUrl || client.user.displayAvatarURL({ size:128 });
        const embed=new EmbedBuilder().setColor(Theme.panel)
            .setAuthor({ name:`${dispName} • About`, iconURL: dispIcon })
            .setTitle(dispName)
            .setDescription(`Discord bot for server management.`)
            .addFields(
                { name:"Features", value:
                    `• **Tickets** — support requests\n`+
                    `• **Moderation** — bans, timeouts, cases\n`+
                    `• **AutoMod** — content filtering\n`+
                    `• **Leveling** — XP and levels\n`+
                    `• **Economy** — currency and rewards\n`+
                    `• **Automation** — roles and workflows`, inline:false },
                { name:"Getting Started", value:
                    `**1.** Invite the bot to your server.\n`+
                    `**2.** Run \`/autosetup\` to set up roles and channels.\n`+
                    `**3.** Use \`/setuptickets\` to create ticket panels.`, inline:false },
                { name:"Help", value:
                    `\`/help\` — Command list and usage\n`+
                    `\`/config\` — Server settings\n`+
                    `\`/support\` — Get help`, inline:false },
            )
            .setThumbnail(dispIcon)
            .setFooter({ text: guild.name }).setTimestamp();
        const row=new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel("Invite").setStyle(ButtonStyle.Link).setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`),
            new ButtonBuilder().setCustomId("about:help").setLabel("Help").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("about:support").setLabel("Support").setStyle(ButtonStyle.Secondary)
        );
        client.components.set("about:help", async(i)=>{
            const e=embeds.info("Help","Run `/help` and pick a topic — Getting Started, Tickets, Moderation, etc.");
            await i.reply({ embeds:[e], flags: MessageFlags.Ephemeral}).catch(()=>{});
        });
        client.components.set("about:support", async(i)=>{
            await i.reply({ embeds:[embeds.info("Support","Open a ticket via panel or `/ticket list` — staff will claim.")], flags: MessageFlags.Ephemeral}).catch(()=>{});
        });
        await interaction.reply({ embeds:[embed], components:[row], flags: MessageFlags.Ephemeral}).catch(()=>{});
    }
};
