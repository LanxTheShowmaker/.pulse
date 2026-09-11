const ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
function emit(level, scope, message, meta) {
    const raw = process.env.LOG_LEVEL || "info";
    const threshold = ORDER[raw] === undefined ? "info" : raw;
    if (ORDER[level] < ORDER[threshold])
        return;
    const ts = new Date().toISOString();
    const line = `[${ts}] ${level.toUpperCase().padEnd(5)} ${scope.padEnd(12)} ${message}`;
    if (level === "error")
        console.error(line, meta ?? "");
    else if (level === "warn")
        console.warn(line, meta ?? "");
    else
        console.log(line);
}
export const logger = {
    debug: (scope, msg, meta) => emit("debug", scope, msg, meta),
    info: (scope, msg, meta) => emit("info", scope, msg, meta),
    warn: (scope, msg, meta) => emit("warn", scope, msg, meta),
    error: (scope, msg, meta) => emit("error", scope, msg, meta),
};
//# sourceMappingURL=logger.js.map