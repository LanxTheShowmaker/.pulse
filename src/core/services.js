import { PrismaClient } from "@prisma/client";
import { SettingsService } from "../services/settings.js";
import { CasesService } from "../services/cases.js";
import { LoggingService } from "../services/logging.js";
import { ModerationService } from "../services/moderation.js";
import { AutomodService } from "../services/automod.js";
import { OrderService } from "../services/orders.js";
import { UtilityService } from "../services/utility.js";
import { FortressService } from "../services/fortress.js";
import { AssetService } from "../services/assets.js";
import { PanelService } from "../services/panels.js";
import { TicketSystemService } from "../services/ticketSystem.js";
import { WelcomeService } from "../services/welcome.js";
import { LevelingService } from "../services/leveling.js";
import { ReactionRoleService } from "../services/reactionRoles.js";
import { EconomyService } from "../services/economy.js";
import { GiveawayService } from "../services/giveaways.js";
import { SuggestionService } from "../services/suggestions.js";
import { StarboardService } from "../services/starboard.js";
import { AfkService } from "../services/afk.js";
import { AuditService } from "../services/audit.js";
import { AnalyticsService } from "../services/analytics.js";
import { IntelligenceService } from "../services/intelligence.js";
import { RaidProtectionService } from "../services/raidProtection.js";
import { AchievementService } from "../services/achievements.js";
import { AutomationService } from "../services/automation.js";
import { BackupService } from "../services/backup.js";
import { DiagnosticsService } from "../services/diagnostics.js";
import { BrandingService } from "../services/branding.js";
import { PrefixService } from "../services/prefixService.js";

export function createServices(client) {
    const prisma = new PrismaClient();
    prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
    prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
    prisma.$executeRawUnsafe("PRAGMA synchronous=NORMAL;").catch(() => {});

    const settings = new SettingsService(prisma, client);
    const cases = new CasesService(prisma);
    const logging = new LoggingService(prisma, client);
    const moderation = new ModerationService(prisma, cases, logging, client);
    const automod = new AutomodService(prisma, client, settings, logging);
    const orders = new OrderService(prisma, client, settings);
    const fortress = new FortressService(prisma, client, settings, logging);
    const utility = new UtilityService(prisma, client);
    const assets = new AssetService(client);
    const panels = new PanelService(prisma, client);
    const tickets = new TicketSystemService(prisma, client, settings, logging);
    const welcome = new WelcomeService(prisma, client, settings);
    const leveling = new LevelingService(prisma, client);
    const reactionRoles = new ReactionRoleService(prisma, client);
    const economy = new EconomyService(prisma, client);
    const giveaways = new GiveawayService(prisma, client);
    const suggestions = new SuggestionService(prisma, client);
    const starboard = new StarboardService(prisma, client);
    const afk = new AfkService(prisma, client);
    const audit = new AuditService(prisma, client);
    const analytics = new AnalyticsService(prisma, client);
    const intelligence = new IntelligenceService(prisma, client);
    const raid = new RaidProtectionService(prisma, client, settings, logging, intelligence);
    const achievements = new AchievementService(prisma, client);
    const automation = new AutomationService(prisma, client);
    const backup = new BackupService(prisma, client);
    const diagnostics = new DiagnosticsService(prisma, client);
    const branding = new BrandingService(prisma, client);
    const prefix = new PrefixService(prisma, client);

    client.prisma = prisma;
    return {
        settings, cases, moderation, logging, automod, orders, fortress, utility,
        assets, panels, tickets, welcome, leveling, reactionRoles, economy,
        giveaways, suggestions, starboard, afk, audit, analytics, intelligence,
        raid, achievements, automation, backup, diagnostics, branding, prefix, prisma
    };
}

export function isStaff(member, config) {
    if (member.permissions.has("Administrator") || member.permissions.has("ManageGuild"))
        return true;
    const roleIds = new Set(member.roles.cache.keys());
    if (!config)
        return false;
    if (config.staffRoleIds.some((id) => roleIds.has(id)))
        return true;
    if (config.moderatorRoleIds.some((id) => roleIds.has(id)))
        return true;
    return false;
}

export function isModerator(member, config) {
    if (member.permissions.has("BanMembers") || member.permissions.has("KickMembers") || member.permissions.has("ModerateMembers"))
        return true;
    if (!config)
        return false;
    const roleIds = new Set(member.roles.cache.keys());
    return config.moderatorRoleIds.some((id) => roleIds.has(id));
}

export function isIgnored(member, config) {
    if (!config)
        return false;
    const roleIds = new Set(member.roles.cache.keys());
    if (config.ignoredUserIds.includes(member.id))
        return true;
    if (config.ignoredRoleIds.some((id) => roleIds.has(id)))
        return true;
    return false;
}
//# sourceMappingURL=services.js.map