import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import { logger } from "./logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function walk(dir) {
    const out = [];
    if (!fs.existsSync(dir))
        return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...(await walk(full)));
        else if (entry.name.endsWith(".js"))
            out.push(full);
    }
    return out;
}

export async function loadCommands() {
    const commands = new Collection();
    const dir = path.join(here, "..", "commands");
    const files = await walk(dir);
    const commandFiles = files.filter(f => {
        const base = path.basename(f);
        if (base === "shared.js") return false;
        return true;
    });

    let loaded = 0, failed = 0;
    const failures = [];

    for (const file of commandFiles) {
        try {
            const mod = await import(pathToFileURL(file).href);
            const cmd = mod.default ?? mod;
            if (!cmd?.data?.name) {
                failed++;
                failures.push({ file: path.relative(process.cwd(), file), error: "Missing data.name" });
                logger.error("registry", `Command missing data.name: ${file}`);
                continue;
            }
            try {
                cmd.data.toJSON();
            } catch (e) {
                failed++;
                failures.push({ file: path.relative(process.cwd(), file), name: cmd.data.name, error: e.message });
                logger.error("registry", `Command serialization failed: ${cmd.data.name}`, e);
                continue;
            }
            if (commands.has(cmd.data.name)) {
                failed++;
                failures.push({ file: path.relative(process.cwd(), file), error: `Duplicate command name: ${cmd.data.name}` });
                logger.error("registry", `Duplicate command name: ${cmd.data.name}`);
                continue;
            }
            commands.set(cmd.data.name, cmd);
            loaded++;
        } catch (e) {
            failed++;
            failures.push({ file: path.relative(process.cwd(), file), error: e.message });
            logger.error("registry", `Command load failed: ${file}`, e);
        }
    }

    logger.info("registry", `Commands loaded: ${loaded}, failed: ${failed}`);
    if (failures.length) {
        for (const f of failures) logger.warn("registry", `Failure: ${f.file} - ${f.error}`);
    }
    return commands;
}

export async function loadEvents() {
    const events = [];
    const seen = new Set();
    let failed = 0;
    const files = await walk(path.join(here, "..", "events"));
    for (const file of files) {
        try {
            const mod = await import(pathToFileURL(file).href);
            const ev = mod.default ?? mod;
            if (!ev?.name) {
                failed++;
                logger.error("registry", `Event missing name: ${file}`);
                continue;
            }
            if (typeof ev.execute !== "function") {
                failed++;
                logger.error("registry", `Event missing execute: ${ev.name} (${file})`);
                continue;
            }
            if (seen.has(ev.name)) {
                failed++;
                logger.error("registry", `Duplicate event name: ${ev.name} (${file})`);
                continue;
            }
            seen.add(ev.name);
            events.push(ev);
        } catch (e) {
            failed++;
            logger.error("registry", `Event load failed: ${file}`, e);
        }
    }
    logger.info("registry", `Events loaded: ${events.length}, failed: ${failed}`);
    return events;
}
//# sourceMappingURL=registry.js.map