/* components/guildSelector.js — session guild rendered from /api/guilds. */
(function () {
    async function init() {
        const mount = document.getElementById("guildSelectorMount");
        if (!mount) return;
        const { esc, shortId } = window.Pulse.ui;
        let guilds = [];
        try {
            guilds = await window.Pulse.state.loadGuilds();
        } catch (e) {
            mount.innerHTML = `<div class="guild-zone"><p class="menu-note">Could not load servers.</p></div>`;
            return;
        }
        if (!Array.isArray(guilds) || guilds.length === 0) {
            mount.innerHTML = `<div class="guild-zone"><p class="menu-note">No server linked to this session yet.</p></div>`;
            return;
        }
        const current = guilds.find((g) => g.current) || guilds[0];
        const iconFor = (g) => g.icon
            ? `<span class="guild-icon"><img src="${esc(g.icon)}" alt="" loading="lazy"></span>`
            : `<span class="guild-icon" aria-hidden="true">${esc((g.name || "S").slice(0, 2).toUpperCase())}</span>`;
        mount.innerHTML = `<div class="guild-zone"><details class="guild-select">`
            + `<summary aria-label="Current server: ${esc(current.name || current.id)}">`
            + `${iconFor(current)}<span class="guild-meta"><strong>${esc(current.name || "Server")}</strong><span>${esc(shortId(current.id))}</span></span>${window.Pulse.icons.chevron}`
            + `</summary><div class="menu" role="menu">`
            + guilds.map((g) => {
                const href = "/dashboard/guild/" + encodeURIComponent(g.id) + "/tickets";
                return `<a class="menu-item" role="menuitem" href="${esc(href)}"${g.current ? ' aria-current="true"' : ""}>${iconFor(g)}<span><strong>${esc(g.name || "Server")}</strong><br><small style="color:var(--text-3);font-family:var(--mono);font-size:.7rem">${esc(g.id)}</small></span>${g.current ? `<span class="tick">${window.Pulse.icons.check}</span>` : ""}</a>`;
            }).join("")
            + `<p class="menu-note">Sessions manage one server at a time.</p>`
            + `</div></details></div>`;
    }

    window.Pulse.guildSelector = { init };
})();
