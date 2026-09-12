import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "./logger.js";

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

    for (const file of files) {
        try {
            const mod = await import(pathToFileURL(file).href);
            const cmd = mod.default ?? mod;
            if (!cmd?.data?.name) { logger.warn("registry", `skip ${file} — no data.name`); continue; }
            if (commands.has(cmd.data.name)) { logger.warn("registry", `duplicate: ${cmd.data.name}`); continue; }
            commands.set(cmd.data.name, cmd);
        } catch (e) {
            logger.error("registry", `failed: ${file}`, e.message);
            failed++;
        }
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

    for (const file of files) {
        try {
            const mod = await import(pathToFileURL(file).href);
            const evt = mod.default ?? mod;
            if (!evt?.name || typeof evt.execute !== "function") {
                logger.warn("registry", `skip ${file} — no name/execute`);
                continue;
            }
            events.push(evt);
        } catch (e) {
            logger.error("registry", `failed: ${file}`, e.message);
            failed++;
        }
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

    for (const file of files) {
        try {
            const mod = await import(pathToFileURL(file).href);
            const exported = mod.default ?? mod;

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
        } catch (e) {
            logger.error("registry", `handler failed: ${file}`, e.message);
            failed++;
        }
    }

    logger.info("registry", `handlers loaded: ${handlers.size}, failed: ${failed}`);
    return handlers;
}
