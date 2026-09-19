// Parameter + body validation against the ACTUAL Prisma schema shapes.
// GuildConfig string fields; ticket/case identifiers; no invented fields.

const GUILD_CONFIG_FIELDS = new Set([
    "prefix",
    "logChannelId",
    "modLogChannelId",
    "welcomeChannelId",
    "goodbyeChannelId",
    "ticketCategoryId",
    "ticketLogChannelId",
    "staffRoleIds",
    "moderatorRoleIds",
    "ignoredChannelIds",
    "ignoredRoleIds",
    "ignoredUserIds",
    "modules",
    "automod",
    "orders",
]);

// Fields persisted as JSON strings — must parse or the bot breaks later.
const JSON_STRING_FIELDS = new Set([
    "staffRoleIds",
    "moderatorRoleIds",
    "ignoredChannelIds",
    "ignoredRoleIds",
    "ignoredUserIds",
    "modules",
    "automod",
    "orders",
]);

export function validateGuildId(req, res, next) {
    const gid = req.params.guildId;
    if (typeof gid !== "string" || gid.length < 1 || gid.length > 64) {
        const msg = "Invalid guild ID.";
        if (req.path.startsWith("/api/")) return res.status(400).json({ error: msg });
        return res.status(400).send(msg);
    }
    next();
}

export function validateTicketId(req, res, next) {
    const tid = req.params.ticketId;
    if (typeof tid !== "string" || tid.length < 1 || tid.length > 128) {
        return res.status(400).json({ error: "Invalid ticket ID." });
    }
    next();
}

export function validateCaseNumber(req, res, next) {
    const n = parseInt(req.params.caseNumber, 10);
    if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: "Invalid case number." });
    }
    req.caseNumber = n;
    next();
}

// Allowlist + type check for guild config writes. Arrays/objects for JSON
// fields are normalized to JSON strings (what Prisma stores); anything else
// is rejected instead of crashing Prisma or corrupting bot state.
export function validateSettingsBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Invalid settings body." });
    }
    const clean = {};
    for (const [key, value] of Object.entries(body)) {
        if (!GUILD_CONFIG_FIELDS.has(key)) {
            return res.status(400).json({ error: `Unknown setting: ${key}.` });
        }
        if (value === null) {
            clean[key] = null;
            continue;
        }
        if (JSON_STRING_FIELDS.has(key)) {
            if (typeof value === "string") {
                try { JSON.parse(value); } catch {
                    return res.status(400).json({ error: `Setting ${key} must be valid JSON.` });
                }
                clean[key] = value;
            } else if (Array.isArray(value) || (typeof value === "object")) {
                clean[key] = JSON.stringify(value);
            } else {
                return res.status(400).json({ error: `Setting ${key} must be JSON.` });
            }
            continue;
        }
        if (typeof value !== "string") {
            return res.status(400).json({ error: `Setting ${key} must be a string.` });
        }
        clean[key] = value;
    }
    if (clean.prefix !== undefined && (clean.prefix.length < 1 || clean.prefix.length > 8)) {
        return res.status(400).json({ error: "Prefix must be 1-8 characters." });
    }
    req.cleanSettings = clean;
    next();
}

// Map known service validation errors to 400/404; everything else is 500
// without leaking internals.
export function serviceError(res, e, resource = "Request") {
    const msg = e?.message || "";
    if (/not found/i.test(msg)) return res.status(404).json({ error: `${resource} not found.` });
    if (/invalid|cannot|only|transition|already|missing|required/i.test(msg)) {
        return res.status(400).json({ error: msg.slice(0, 200) });
    }
    return res.status(500).json({ error: "Unexpected server error." });
}
