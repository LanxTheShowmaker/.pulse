/* pages/modlog.js — audit-trail table with search. */
(function () {
    const { apiFetch } = window.Pulse;
    let pager = null;

    function applyFilter() {
        const q = (document.getElementById("logSearch") || {}).value || "";
        const needle = q.trim().toLowerCase();
        const matched = [];
        document.querySelectorAll("#logTable tbody tr[data-search]").forEach((r) => {
            const ok = !needle || r.getAttribute("data-search").indexOf(needle) > -1;
            if (ok) matched.push(r);
            else r.style.display = "none";
        });
        if (pager) pager.setRows(matched);
        const empty = document.getElementById("noLogResults");
        if (empty) empty.style.display = matched.length === 0 ? "" : "none";
    }

    async function load() {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const body = document.getElementById("logBody");
        const sub = document.getElementById("logSub");
        const gid = window.Pulse.router.guildIdFromPath();
        try {
            if (!gid) throw Object.assign(new Error("No guild selected."), { status: 400 });
            const list = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/logs/mod");
            if (sub) sub.textContent = `${list.length} shown · up to 50 most recent`;
            if (list.length === 0) {
                body.innerHTML = ui.emptyState(icons.log, "No log entries", "Audit log entries for moderation will appear here.");
                return;
            }
            body.innerHTML = `<div class="toolbar" role="search"><div class="search-box">${icons.search}<input class="input" id="logSearch" type="search" placeholder="Search log…" aria-label="Search log" autocomplete="off"></div></div>`
                + `<div class="table-wrap"><table id="logTable"><thead><tr><th scope="col">Time</th><th scope="col">Category</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead><tbody>`
                + list.map((h) => {
                    const hay = `${h.category || ""} ${h.action || ""} ${h.actorId || ""} ${h.targetId || ""} ${h.details || ""}`.toLowerCase();
                    return `<tr data-search="${ui.esc(hay)}"><td>${ui.relTime(h.createdAt)}</td><td>${ui.esc(h.category || "—")}</td><td>${ui.esc(h.action || "—")}</td><td class="mono">${ui.esc(ui.shortId(h.actorId) || "—")}</td><td class="mono">${ui.esc(ui.shortId(h.targetId) || "—")}</td><td class="truncate" title="${ui.esc(h.details || "")}">${ui.esc(h.details || "—")}</td></tr>`;
                }).join("")
                + `<tr id="noLogResults" style="display:none"><td colspan="6" style="text-align:center;color:var(--text-2);padding:1.6rem">No entries match the current search.</td></tr>`
                + `</tbody></table></div><p class="count-note" id="logCount" aria-live="polite">${list.length} shown</p>`;
            const q = document.getElementById("logSearch");
            if (q) q.addEventListener("input", applyFilter);
            pager = ui.createPager(document.querySelector("#logTable tbody"), document.getElementById("logCount"), 15);
            applyFilter();
            ui.hydrateTimes(document);
        } catch (e) {
            const msg = e.status === 403 ? "You do not have access to this server." : (e.message || "Could not load the log.");
            if (sub) sub.textContent = "Unavailable";
            body.innerHTML = ui.errorState(icons.alert, "Could not load log", msg);
        }
    }

    function boot() {
        window.Pulse.sidebar.init();
        Promise.allSettled([window.Pulse.topbar.init(), window.Pulse.guildSelector.init(), window.Pulse.userMenu.init()]);
        document.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest("[data-retry]")) load(); });
        load();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
