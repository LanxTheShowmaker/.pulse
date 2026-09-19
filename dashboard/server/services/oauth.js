import https from "https";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || ("http://localhost:" + (process.env.DASHBOARD_PORT || 9875) + "/auth/discord/callback");

export function discordOAuthURL(state) {
    const p = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: DISCORD_REDIRECT_URI, response_type: "code", scope: "identify guilds", state });
    return "https://discord.com/api/oauth2/authorize?" + p.toString();
}

export function discordTokenExchange(code) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: DISCORD_REDIRECT_URI });
        const req = https.request("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("token parse")); } }); });
        req.on("error", reject);
        req.write(params.toString());
        req.end();
    });
}

export function fetchDiscordUser(t) {
    return new Promise((r, j) => {
        const req = https.request("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + t } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { r(JSON.parse(d)); } catch (e) { j(new Error("user")); } }); });
        req.on("error", j); req.end();
    });
}

export function fetchDiscordGuilds(t) {
    return new Promise((r, j) => {
        const req = https.request("https://discord.com/api/users/@me/guilds", { headers: { Authorization: "Bearer " + t } }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { r(JSON.parse(d)); } catch (e) { j(new Error("guilds")); } }); });
        req.on("error", j); req.end();
    });
}
