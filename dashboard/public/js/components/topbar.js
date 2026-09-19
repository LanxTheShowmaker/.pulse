/* components/topbar.js — breadcrumb, search, guild pill, nav toggles. */
(function () {
    function init() {
        const bar = document.getElementById("topbar");
        if (!bar) return;
        const { esc, shortId } = window.Pulse.ui;
        const { icons } = window.Pulse;
        const gid = window.Pulse.router.guildIdFromPath();
        const crumb = (document.body && document.body.dataset.crumb) || "Dashboard";
        bar.innerHTML = `<button class="icon-btn" id="navToggle" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icons.menu}</button>`
            + `<button class="icon-btn" id="collapseToggle" aria-label="Collapse sidebar">${icons.collapse}</button>`
            + `<nav class="crumb" aria-label="Breadcrumb">Pulse <span aria-hidden="true">/</span> <strong>${esc(crumb)}</strong></nav>`
            + `<div class="spacer"></div>`
            + (gid
                ? `<form class="top-search" action="/dashboard/guild/${esc(gid)}/tickets" method="GET" role="search"><div class="search-box">${icons.search}<input class="input" name="q" type="search" placeholder="Search tickets…" aria-label="Search tickets" autocomplete="off"></div></form>`
                : ``)
            + `<span class="guild-pill" id="guildPill"><span class="dot off" aria-hidden="true"></span><span>Loading…</span></span>`
            + `<span id="userMenuMount"></span>`;
        window.Pulse.state.loadGuilds().then((guilds) => {
            const pill = document.getElementById("guildPill");
            if (!pill) return;
            const list = Array.isArray(guilds) ? guilds : [];
            const current = list.find((g) => g.current) || list[0];
            if (!current) {
                pill.innerHTML = `<span class="dot off" aria-hidden="true"></span><span>No server</span>`;
                return;
            }
            const label = current.name
                ? `<span class="gid-full">${esc(current.name)}</span><span class="gid-short">${esc(shortId(current.id))}</span>`
                : `<span class="gid-full"><code class="mono" style="border:0;background:none;padding:0">${esc(current.id)}</code></span><span class="gid-short">${esc(shortId(current.id))}</span>`;
            pill.innerHTML = `<span class="dot on" aria-hidden="true"></span>${label}`;
        }).catch(() => {
            const pill = document.getElementById("guildPill");
            if (pill) pill.innerHTML = `<span class="dot off" aria-hidden="true"></span><span>Unknown</span>`;
        });
    }

    window.Pulse.topbar = { init };
})();
