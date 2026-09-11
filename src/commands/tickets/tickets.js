import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { containerReply, containerFollowUp } from "../../design/containers/base.js";
import { successPanel, errorPanel, infoPanel } from "../../design/containers/panels.js";
import { ticketTypeConfigPanel, ticketTypeEditPanel } from "../../design/containers/tickets.js";

export default {
    data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Manage ticket system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName("config").setDescription("View and manage ticket types"))
        .addSubcommand(s => s.setName("create-type").setDescription("Create a new ticket type")
            .addStringOption(o => o.setName("key").setDescription("Unique key (e.g., support)").setRequired(true))
            .addStringOption(o => o.setName("name").setDescription("Display name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Description").setRequired(false))
            .addChannelOption(o => o.setName("category").setDescription("Category channel").addChannelTypes(4).setRequired(false))
            .addRoleOption(o => o.setName("staff-role").setDescription("Staff role").setRequired(false))
            .addStringOption(o => o.setName("emoji").setDescription("Emoji").setRequired(false))
        )
        .addSubcommand(s => s.setName("edit-type").setDescription("Edit a ticket type")
            .addStringOption(o => o.setName("key").setDescription("Ticket type key").setRequired(true))
        )
        .addSubcommand(s => s.setName("delete-type").setDescription("Delete a ticket type")
            .addStringOption(o => o.setName("key").setDescription("Ticket type key").setRequired(true))
        )
        .addSubcommand(s => s.setName("panel").setDescription("Post ticket panel")
            .addChannelOption(o => o.setName("channel").setDescription("Channel to post in").addChannelTypes(0).setRequired(true))
        ),
    category: "Config",
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const prisma = interaction.client.prisma;
        
        if (sub === "config") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            const types = await prisma.ticketType.findMany({ where: { guildId: interaction.guildId } }).catch(() => []);
            return containerReply(interaction, ticketTypeConfigPanel(types, interaction.guild), true);
        }
        
        if (sub === "create-type") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            const key = interaction.options.getString("key");
            const name = interaction.options.getString("name");
            const description = interaction.options.getString("description") || "";
            const category = interaction.options.getChannel("category");
            const staffRole = interaction.options.getRole("staff-role");
            const emoji = interaction.options.getString("emoji") || "";
            
            const exists = await prisma.ticketType.findUnique({ where: { guildId_key: { guildId: interaction.guildId, key } } });
            if (exists) {
                return containerReply(interaction, errorPanel("Already Exists", `Ticket type with key \`${key}\` already exists.`), true);
            }
            
            await prisma.ticketType.create({
                data: {
                    guildId: interaction.guildId,
                    key,
                    displayName: name,
                    description,
                    categoryId: category?.id,
                    staffRoleIds: staffRole?.id ? [staffRole.id] : [],
                    emoji,
                    panelType: "default",
                }
            });
            
            return containerReply(interaction, successPanel("Ticket Type Created", `Created **${name}** (\`${key}\`)`), true);
        }
        
        if (sub === "edit-type") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            const key = interaction.options.getString("key");
            const type = await prisma.ticketType.findUnique({ where: { guildId_key: { guildId: interaction.guildId, key } } });
            if (!type) {
                return containerReply(interaction, errorPanel("Not Found", `Ticket type \`${key}\` not found.`), true);
            }
            return containerReply(interaction, ticketTypeEditPanel(type, interaction.guild), true);
        }
        
        if (sub === "delete-type") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            const key = interaction.options.getString("key");
            await prisma.ticketType.delete({ where: { guildId_key: { guildId: interaction.guildId, key } } }).catch(() => {});
            return containerReply(interaction, successPanel("Deleted", `Ticket type \`${key}\` deleted.`), true);
        }
        
        if (sub === "panel") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return containerReply(interaction, errorPanel("Missing Permission", "You need Manage Server permission."), true);
            }
            const channel = interaction.options.getChannel("channel");
            const types = await prisma.ticketType.findMany({ where: { guildId: interaction.guildId, enabled: true } });
            
            if (types.length === 0) {
                return containerReply(interaction, errorPanel("No Types", "No enabled ticket types to display."), true);
            }
            
            const { createContainer, createSection, createTextDisplay, createThumbnail, createActionRow, createButton, ButtonStyle, createSelectMenu, createSelectOption, divider, headerText, bodyText, mutedText, spacer } = await import("../../design/containers/base.js");
            const { Brand } = await import("../../design/theme.js");
            
            const options = types.map(t => createSelectOption(t.displayName, t.key, t.description, t.emoji));
            
            const container = createContainer([
                headerText(`Support Tickets`),
                divider(),
                bodyText("Select a category below to create a ticket:"),
                divider(),
                createActionRow(createSelectMenu("ticket:create:select", "Choose ticket type...", options)),
                spacer(),
                mutedText(Brand.footer),
            ]);
            
            await channel.send({ components: [container] });
            return containerReply(interaction, successPanel("Panel Posted", `Ticket panel posted in <#${channel.id}>`), true);
        }
    }
};