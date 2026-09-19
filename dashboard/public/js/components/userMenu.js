/* components/userMenu.js — account dropdown + sidebar user chip. */
(function () {
    async function init() {
        const { esc, shortId, relTime } = window.Pulse.ui;
        let session = null;
        try {
            session = await window.Pulse.state.loadSession();
        } catch (e) { return; }
        if (!session) return;
        const initial = esc(String(session.id || "?").slice(0, 2).toUpperCase());
        const mount = document.getElementById("userMenuMount");
        if (mount) {
            mount.innerHTML = `<details class="user-menu"><summary aria-label="Account menu" aria-haspopup="menu"><span class="avatar" aria-hidden="true">${initial}</span>${window.Pulse.icons.chevron}</summary>`
                + `<div class="menu" role="menu"><div class="menu-head">Signed in as<br><strong>User ${esc(shortId(session.id))}</strong></div><hr class="menu-sep">`
                + `<div class="menu-head">Session expires<br><strong>${relTime(session.expiresAt)}</strong></div><hr class="menu-sep">`
                + `<form class="logout-form" action="/auth/logout" method="POST"><button type="submit" class="btn btn-secondary btn-sm">Log out</button></form></div></details>`;
        }
        const foot = document.getElementById("sideFoot");
        if (foot) {
            foot.innerHTML = `<div class="user-chip"><div class="avatar" aria-hidden="true">${initial}</div>`
                + `<div class="who"><strong>User ${esc(shortId(session.id))}</strong><span>Discord account</span></div>`
                + `<form class="logout-form" action="/auth/logout" method="POST"><button type="submit" class="icon-btn" aria-label="Log out" title="Log out">${window.Pulse.icons.logout}</button></form></div>`;
        }
        window.Pulse.ui.hydrateTimes(document);
    }

    window.Pulse.userMenu = { init };
})();
