/* pages/serverSelect.js — real manageable servers, honest availability. */
(function () {
    const { apiFetch } = window.Pulse;
    let selecting = false;

    function cardHtml(g) {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const icon = g.icon
            ? `<span class="server-icon"><img src="${ui.esc(g.icon)}" alt="" loading="lazy"></span>`
            : `<span class="server-icon" aria-hidden="true">${ui.esc((g.name || "S").slice(0, 2).toUpperCase())}</span>`;
        const badges = [];
        if (g.owner) badges.push(`<span class="badge b-muted">Owner</span>`);
        if (g.botPresent) badges.push(`<span class="badge b-success">Bot installed</span>`);
        else badges.push(`<span class="badge b-danger">Bot missing</span>`);
        if (g.memberCount != null) badges.push(`<span class="badge b-muted">${Number(g.memberCount).toLocaleString()} members</span>`);
        const action = g.botPresent
            ? `<button type="button" class="btn btn-primary" data-select="${ui.esc(g.id)}">Manage →</button>`
            : `<button type="button" class="btn btn-secondary" disabled title="Invite .pulse to this server first">Unavailable</button>`;
        return `<article class="server-card${g.botPresent ? "" : " unavailable"}">${icon && `<div class="server-top">${icon}<div style="min-width:0"><strong>${ui.esc(g.name || "Server")}</strong><small>${ui.esc(g.id)}</small></div></div>`}`
            + `<div class="server-meta">${badges.join("")}</div>${action}</article>`;
    }

    async function selectGuild(gid, btn) {
        if (selecting) return;
        selecting = true;
        if (btn) { btn.disabled = true; }
        try {
            const out = await apiFetch("/api/guild/select", { method: "POST", body: JSON.stringify({ guildId: gid }) });
            window.location.href = (out && out.redirect) || ("/dashboard/guild/" + encodeURIComponent(gid));
        } catch (e) {
            window.Pulse.toast(e.message || "Could not select this server.", "err");
            selecting = false;
            if (btn) btn.disabled = false;
        }
    }

    async function load() {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const grid = document.getElementById("serverGrid");
        try {
            const guilds = await apiFetch("/api/guilds");
            if (!Array.isArray(guilds) || guilds.length === 0) {
                grid.innerHTML = ui.emptyState(icons.server || icons.shield, "No manageable servers",
                    "None of your Discord servers can be managed right now. You need management permissions on a server where .pulse is installed.",
                    `<a class="btn btn-secondary" href="/">Back to homepage</a>`);
                return;
            }
            grid.innerHTML = `<div class="server-grid">${guilds.map(cardHtml).join("")}</div>`;
            grid.querySelectorAll("[data-select]").forEach((b) => {
                b.addEventListener("click", () => selectGuild(b.getAttribute("data-select"), b));
            });
        } catch (e) {
            grid.innerHTML = ui.errorState(icons.alert, "Could not load servers", e.message || "Something went wrong loading your servers.");
        }
    }

    function boot() {
        document.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest("[data-retry]")) load(); });
        load();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
