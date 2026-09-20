import { readdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "./logger.js";

// Helper/shared modules live alongside commands but are not commands
// themselves (no default export with data.name). Skip them silently.
const HELPER_FILES = new Set(["shared.js", "helpers.js", "util.js", "utils.js", "common.js"]);

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) files.push(...await walk(full));
        else if (extname(e.name) === ".js") files.push(full);
    }
    return files;
}

export async function loadCommands() {
    const commands = new Map();
    const dir = join(import.meta.dirname, "..", "commands");
    let failed = 0;

    let files;
    try { files = await walk(dir); } catch { return commands; }
    files.sort();

    // Import in parallel for faster boot; results stay in file order so
    // duplicate handling is deterministic.
    const loaded = await Promise.all(files.map(async (file) => {
        if (HELPER_FILES.has(basename(file))) return null;
        try {
            const mod = await import(pathToFileURL(file).href);
            return { file, cmd: mod.default ?? mod };
        } catch (e) {
            logger.error("registry", `failed: ${file}`, e.message);
            return { file, failed: true };
        }
    }));

    for (const item of loaded) {
        if (!item) continue;
        if (item.failed) { failed++; continue; }
        const { file, cmd } = item;
        if (!cmd?.data?.name) { logger.warn("registry", `skip ${file} — no data.name`); continue; }
        if (commands.has(cmd.data.name)) { logger.warn("registry", `duplicate: ${cmd.data.name}`); continue; }
        commands.set(cmd.data.name, cmd);
    }

    logger.info("registry", `commands loaded: ${commands.size}, failed: ${failed}`);
    return commands;
}

export async function loadEvents() {
    const events = [];
    const dir = join(import.meta.dirname, "..", "events");
    let failed = 0;

    let files;
    try { files = await walk(dir); } catch { return events; }
    files.sort();

    const loaded = await Promise.all(files.map(async (file) => {
        try {
            const mod = await import(pathToFileURL(file).href);
            return { file, evt: mod.default ?? mod };
        } catch (e) {
            logger.error("registry", `failed: ${file}`, e.message);
            return { file, failed: true };
        }
    }));

    for (const item of loaded) {
        if (item.failed) { failed++; continue; }
        const { file, evt } = item;
        if (!evt?.name || typeof evt.execute !== "function") {
            logger.warn("registry", `skip ${file} — no name/execute`);
            continue;
        }
        events.push(evt);
    }

    logger.info("registry", `events loaded: ${events.length}, failed: ${failed}`);
    return events;
}

export async function loadHandlers() {
    const handlers = new Map();
    const dir = join(import.meta.dirname, "..", "handlers");
    let failed = 0;

    let files;
    try { files = await walk(dir); } catch { return handlers; }
    files.sort();

    const loaded = await Promise.all(files.map(async (file) => {
        try {
            const mod = await import(pathToFileURL(file).href);
            return { file, exported: mod.default ?? mod };
        } catch (e) {
            logger.error("registry", `handler failed: ${file}`, e.message);
            return { file, failed: true };
        }
    }));

    for (const item of loaded) {
        if (item.failed) { failed++; continue; }
        const { file, exported } = item;

        // Support both: default export is a Map, or export { handlers: [...] }
        if (exported instanceof Map) {
            for (const [key, val] of exported) handlers.set(key, val);
        } else if (Array.isArray(exported)) {
            for (const h of exported) {
                if (h.id && h.execute) handlers.set(h.id, h.execute);
            }
        } else if (typeof exported === "object") {
            for (const [key, val] of Object.entries(exported)) {
                if (typeof val === "function") handlers.set(key, val);
            }
        }
    }

    logger.info("registry", `handlers loaded: ${handlers.size}, failed: ${failed}`);
    return handlers;
}
