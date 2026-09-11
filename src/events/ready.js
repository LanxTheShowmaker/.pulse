import { logger } from "../core/logger.js";

export default {
    name: "clientReady",
    once: true,
    async execute(client) {
        logger.info("ready", `.pulse online as ${client.user?.tag} • ${client.guilds.cache.size} guilds`);
        // Reapply per-server nicknames (and guild avatars where supported) — persists after restart/reconnect
        try {
            for (const guild of client.guilds.cache.values()) {
                try {
                    await client.services.branding?.applyNickname(guild).catch((e) => logger.warn("ready", "applyNickname failed", e.message));
                    const branding = await client.services.branding?.get(guild.id).catch((e) => { logger.warn("ready", "get branding failed", e.message); return null; });
                    if (branding?.avatarUrl) {
                        try {
                            const res = await fetch(branding.avatarUrl).catch((e) => { logger.warn("ready", "fetch avatar failed", e.message); return null; });
                            if (res && res.ok) {
                                const ct = res.headers.get("content-type") || "image/png";
                                if (ct.startsWith("image/")) {
                                    const buf = Buffer.from(await res.arrayBuffer());
                                    if (buf.length > 0 && buf.length <= 8 * 1024 * 1024) {
                                        const b64 = `data:${ct};base64,${buf.toString("base64")}`;
                                        if (typeof guild.members.editMe === "function") {
                                            await guild.members.editMe({ avatar: b64, reason: "Branding: per-server avatar" }).catch((e) => logger.warn("ready", "editMe avatar failed", e.message));
                                        } else {
                                            await guild.members.me?.edit({ avatar: b64 }).catch((e) => logger.warn("ready", "edit avatar failed", e.message));
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            logger.warn("ready", "avatar processing failed", e.message);
                        }
                    }
                } catch (e) { logger.warn("ready", "branding reapply failed for " + guild.id, e.message); }
            }
            logger.info("ready", "per-server branding reapplied");
        } catch (e) { logger.error("ready", "branding reapply outer failed", e); }
        // Also schedule periodic reapply every 30m in case of external nickname changes
        const brandingInterval = setInterval(async () => {
            for (const guild of client.guilds.cache.values()) {
                await client.services.branding?.applyNickname(guild).catch((e) => logger.warn("ready", "periodic applyNickname failed", e.message));
            }
        }, 30 * 60 * 1000);
        if (brandingInterval.unref) brandingInterval.unref();
    },
};
//# sourceMappingURL=ready.js.map