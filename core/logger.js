const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? 1;

function fmt(level, scope, msg, data) {
    const ts = new Date().toISOString();
    let extra = "";
    if (data !== undefined) {
        if (data instanceof Error) {
            extra = ` ${data.stack || data.message || String(data)}`;
        } else if (typeof data === "string") {
            extra = ` ${data}`;
        } else {
            extra = ` ${JSON.stringify(data)}`;
        }
    }
    return `[${ts}] ${level.toUpperCase().padEnd(5)} ${scope.padEnd(12)} ${msg}${extra}`;
}

export const logger = {
    debug: (scope, msg, data) => { if (current <= 0) console.log(fmt("debug", scope, msg, data)); },
    info:  (scope, msg, data) => { if (current <= 1) console.log(fmt("info",  scope, msg, data)); },
    warn:  (scope, msg, data) => { if (current <= 2) console.warn(fmt("warn",  scope, msg, data)); },
    error: (scope, msg, data) => { if (current <= 3) console.error(fmt("error", scope, msg, data)); },
};
