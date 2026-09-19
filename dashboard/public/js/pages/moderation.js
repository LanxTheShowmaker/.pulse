/* pages/moderation.js — real case list, search/filter, case details. */
(function () {
    const { apiFetch } = window.Pulse;
    let gid = null;
    let pager = null;

    function applyFilter() {
        const q = (document.getElementById("caseSearch") || {}).value || "";
        const needle = q.trim().toLowerCase();
        const act = (document.getElementById("actionFilter") || {}).value || "";
        const matched = [];
        document.querySelectorAll("#caseTable tbody tr[data-search]").forEach((r) => {
            const ok = (!needle || r.getAttribute("data-search").indexOf(needle) > -1)
                && (!act || r.getAttribute("data-action") === act);
            if (ok) matched.push(r);
            else r.style.display = "none";
        });
        if (pager) pager.setRows(matched);
        const empty = document.getElementById("noCaseResults");
        if (empty) empty.style.display = matched.length === 0 ? "" : "none";
    }

    async function openCase(caseNumber) {
        const ui = window.Pulse.ui;
        const modal = window.Pulse.modal;
        modal.open({ title: "Case #" + caseNumber, desc: "Loading…", bodyHtml: '<div class="skel" style="min-height:100px"></div>', actions: [] });
        try {
            const [c, notes] = await Promise.all([
                apiFetch("/api/guild/" + encodeURIComponent(gid) + "/moderation/cases/" + encodeURIComponent(caseNumber)),
                apiFetch("/api/guild/" + encodeURIComponent(gid) + "/moderation/cases/" + encodeURIComponent(caseNumber) + "/notes").catch(() => []),
            ]);
            const body = `<div class="case-detail-head"><span class="mono">#${ui.esc(c.caseNumber)}</span>${ui.statusBadge(c.resolved ? "RESOLVED" : "OPEN")}<span class="badge b-muted">${ui.esc(c.action || "?")}</span></div>`
                + `<dl>`
                + `<div class="kv"><dt>Target</dt><dd class="plain">${ui.esc(c.targetTag || c.targetId || "—")}</dd></div>`
                + `<div class="kv"><dt>Moderator</dt><dd class="plain">${ui.esc(c.moderatorTag || c.moderatorId || "—")}</dd></div>`
                + `<div class="kv"><dt>Reason</dt><dd class="plain">${ui.esc(c.reason || "—")}</dd></div>`
                + `<div class="kv"><dt>Duration</dt><dd class="plain">${ui.esc(c.duration || "—")}</dd></div>`
                + `<div class="kv"><dt>Created</dt><dd class="plain">${ui.relTime(c.createdAt)}</dd></div>`
                + (c.resolved ? `<div class="kv"><dt>Resolved by</dt><dd class="plain">${ui.esc(c.resolvedByTag || c.resolvedById || "—")}</dd></div>` : "")
                + `</dl>`
                + `<h3 style="font-size:.85rem;margin:1rem 0 .4rem">Notes (${(notes || []).length})</h3>`
                + (((notes || []).length === 0) ? `<p class="sub">No notes on this case.</p>` : notes.slice(0, 10).map((n) => `<div class="note-card">${ui.esc(n.content)}<div class="nm">${ui.esc(n.authorTag || ui.shortId(n.authorId))} · ${ui.relTime(n.createdAt)}</div></div>`).join(""));
            modal.open({ title: "Case #" + caseNumber, desc: null, bodyHtml: body, wide: true, actions: [{ label: "Close", kind: "btn-secondary", onClick: () => modal.close() }] });
            ui.hydrateTimes(document);
        } catch (e) {
            modal.open({ title: "Case #" + caseNumber, desc: e.message || "Could not load case.", actions: [{ label: "Close", kind: "btn-secondary", onClick: () => modal.close() }] });
        }
    }

    async function load() {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const body = document.getElementById("casesBody");
        const sub = document.getElementById("casesSub");
        gid = window.Pulse.router.guildIdFromPath();
        const params = new URLSearchParams(window.location.search);
        const initialQ = params.get("q") || "";
        try {
            if (!gid) throw Object.assign(new Error("No guild selected."), { status: 400 });
            const list = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/moderation/cases/recent");
            if (sub) sub.textContent = `${list.length} shown · up to 25 most recent`;
            if (list.length === 0) {
                body.innerHTML = ui.emptyState(icons.shield, "No cases found", "Moderation cases will appear here once actions are taken.");
                return;
            }
            const actions = [...new Set(list.map((c) => String(c.action || "").toUpperCase()).filter(Boolean))].sort();
            body.innerHTML = `<div class="toolbar" role="search"><div class="search-box">${icons.search}<input class="input" id="caseSearch" type="search" placeholder="Search cases…" aria-label="Search cases" autocomplete="off" value="${ui.esc(initialQ)}"></div>`
                + `<select class="select" id="actionFilter" aria-label="Filter by action" style="max-width:190px"><option value="">All actions</option>${actions.map((a) => `<option value="${ui.esc(a)}">${ui.esc(a)}</option>`).join("")}</select></div>`
                + `<div class="table-wrap"><table id="caseTable"><thead><tr><th scope="col">Case</th><th scope="col">Target</th><th scope="col">Action</th><th scope="col">Reason</th><th scope="col">Moderator</th><th scope="col">Date</th></tr></thead><tbody>`
                + list.map((c) => {
                    const hay = `${c.caseNumber} ${c.action || ""} ${c.targetTag || ""} ${c.targetId || ""} ${c.moderatorTag || ""} ${c.reason || ""}`.toLowerCase();
                    return `<tr class="rowlink" tabindex="0" data-search="${ui.esc(hay)}" data-action="${ui.esc(String(c.action || "").toUpperCase())}" data-case="${ui.esc(c.caseNumber)}"><td class="mono">#${ui.esc(c.caseNumber)}</td><td>${ui.esc(c.targetTag || c.targetId || "—")}</td><td>${ui.esc(c.action || "—")}</td><td class="truncate" title="${ui.esc(c.reason || "")}">${ui.esc(c.reason || "—")}</td><td>${ui.esc(c.moderatorTag || "—")}</td><td>${ui.relTime(c.createdAt)}</td></tr>`;
                }).join("")
                + `<tr id="noCaseResults" style="display:none"><td colspan="6" style="text-align:center;color:var(--text-2);padding:1.6rem">No cases match the current filters.</td></tr>`
                + `</tbody></table></div><p class="count-note" id="caseCount" aria-live="polite">${list.length} shown</p>`;
            const q = document.getElementById("caseSearch");
            const af = document.getElementById("actionFilter");
            if (q) q.addEventListener("input", applyFilter);
            if (af) af.addEventListener("change", applyFilter);
            document.querySelectorAll("#caseTable tbody tr[data-case]").forEach((r) => {
                const open = () => openCase(r.getAttribute("data-case"));
                r.addEventListener("click", open);
                r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
            });
            pager = ui.createPager(document.querySelector("#caseTable tbody"), document.getElementById("caseCount"), 15);
            applyFilter();
            ui.hydrateTimes(document);
        } catch (e) {
            const msg = e.status === 403 ? "You do not have access to this server." : (e.message || "Could not load cases.");
            if (sub) sub.textContent = "Unavailable";
            body.innerHTML = ui.errorState(icons.alert, "Could not load cases", msg);
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
