/**
 * Centralized alias definitions for prefix (and slash where applicable) commands.
 * Maps alias -> target command name (must exist as a real command file).
 * Supports subcommands where applicable: alias "sinfo" -> "serverinfo" (no subcommand), but alias resolution preserves subcommand args.
 */
export const ALIASES = {
    // serverinfo family
    "server-info": "serverinfo",
    "sinfo": "serverinfo",
    "si": "serverinfo",
    // balance
    "bal": "balance",
    "wallet": "balance",
    "coins": "balance",
    // health/status -> diagnostics (but health/status already exist as separate commands, keep for prefix alias)
    // whois/userinfo
    "userinfo": "whois",
    "uinfo": "whois",
    // moderation aliases
    "m": "modcenter",
    "cases": "case",
    // shop
    "store": "shop",
    // prefix shorter
    "pref": "prefix",
    // level
    "lvl": "level",
    "levels": "level",
    // economy
    "ec": "economy",
    "econ": "economy",
    // ticket
    "t": "ticket",
    "tickets": "ticket",
    // Add more as needed — centralized, no duplicate command files
};

export function resolveAlias(name){
    const lower=name.toLowerCase();
    return ALIASES[lower] || lower;
}
