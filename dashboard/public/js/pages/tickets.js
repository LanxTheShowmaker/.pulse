/* pages/tickets.js — real ticket list, search/filter, details + actions. */
(function () {
    const { apiFetch } = window.Pulse;
    let gid = null;
    let allTickets = [];
    let typeById = {};
    let pager = null;

    function toolbarHtml(initialQ) {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        return `<div class="toolbar" role="search"><div class="search-box">${icons.search}`
            + `<input class="input" id="ticketSearch" type="search" placeholder="Search tickets…" aria-label="Search tickets" autocomplete="off" value="${ui.esc(initialQ)}"></div>`
            + `<select class="select" id="statusFilter" aria-label="Filter by status" style="max-width:170px"><option value="">All statuses</option><option value="OPEN">Open</option><option value="CLAIMED">Claimed</option><option value="IN_PROGRESS">In progress</option><option value="WAITING">Waiting</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select>`
            + `<select class="select" id="priorityFilter" aria-label="Filter by priority" style="max-width:170px"><option value="">All priorities</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select>`
            + `<select class="select" id="typeFilter" aria-label="Filter by type" style="max-width:190px"><option value="">All types</option></select></div>`;
    }

    function rowHtml(t) {
        const ui = window.Pulse.ui;
        const st = String(t.status || "OPEN").toUpperCase();
        const pr = String(t.priority || "NORMAL").toUpperCase();
        const staff = t.claimedById || t.assignedById;
        const typeName = (t.typeId && typeById[t.typeId]) || "";
        const hay = `${t.id} ${st} ${pr} ${t.openerId || ""} ${staff || ""} ${typeName}`.toLowerCase();
        return `<tr class="rowlink" tabindex="0" data-search="${ui.esc(hay)}" data-status="${ui.esc(st)}" data-priority="${ui.esc(pr)}" data-type="${ui.esc(t.typeId || "")}" data-ticket="${ui.esc(t.id)}">`
            + `<td class="mono">#${ui.esc(String(t.id).slice(0, 8))}</td><td>${ui.statusBadge(st)}</td>`
            + `<td><div>${ui.esc(ui.shortId(t.openerId))}</div><div class="sub">${staff ? "→ " + ui.esc(ui.shortId(staff)) : "Unassigned"}${typeName ? " · " + ui.esc(typeName) : ""}</div></td>`
            + `<td>${ui.priorityBadge(pr)}</td><td>${ui.relTime(t.createdAt)}</td></tr>`;
    }

    function applyFilter() {
        const q = (document.getElementById("ticketSearch") || {}).value || "";
        const needle = q.trim().toLowerCase();
        const st = (document.getElementById("statusFilter") || {}).value || "";
        const pr = (document.getElementById("priorityFilter") || {}).value || "";
        const ty = (document.getElementById("typeFilter") || {}).value || "";
        const matched = [];
        document.querySelectorAll("#ticketTable tbody tr[data-search]").forEach((r) => {
            const ok = (!needle || r.getAttribute("data-search").indexOf(needle) > -1)
                && (!st || r.getAttribute("data-status") === st)
                && (!pr || r.getAttribute("data-priority") === pr)
                && (!ty || r.getAttribute("data-type") === ty);
            if (ok) matched.push(r);
            else r.style.display = "none";
        });
        if (pager) pager.setRows(matched);
        const empty = document.getElementById("noFilterResults");
        if (empty) empty.style.display = matched.length === 0 ? "" : "none";
    }

    async function openDetail(ticketId) {
        const ui = window.Pulse.ui;
        const modal = window.Pulse.modal;
        modal.open({ title: "Ticket #" + String(ticketId).slice(0, 8), desc: "Loading…", bodyHtml: '<div class="skel" style="min-height:120px"></div>', actions: [] });
        try {
            const d = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/tickets/" + encodeURIComponent(ticketId) + "/detail");
            const s = d.summary || {};
            const staff = s.claimedById || s.assignedById;
            const body = `<dl>`
                + `<div class="kv"><dt>Status</dt><dd class="plain">${ui.statusBadge(s.status)}</dd></div>`
                + `<div class="kv"><dt>Priority</dt><dd class="plain">${ui.priorityBadge(s.priority)}</dd></div>`
                + `<div class="kv"><dt>Type</dt><dd class="plain">${d.type ? ui.esc(d.type.displayName || d.type.key) : "—"}</dd></div>`
                + `<div class="kv"><dt>Creator</dt><dd>${ui.esc(ui.shortId(s.openerId))}</dd></div>`
                + `<div class="kv"><dt>Assigned</dt><dd class="plain">${staff ? ui.esc(ui.shortId(staff)) : "Unassigned"}</dd></div>`
                + `<div class="kv"><dt>Opened</dt><dd class="plain">${ui.relTime(s.createdAt)}</dd></div>`
                + `<div class="kv"><dt>Closed</dt><dd class="plain">${s.closedAt ? ui.relTime(s.closedAt) : "—"}</dd></div>`
                + (s.closeReason ? `<div class="kv"><dt>Close reason</dt><dd class="plain">${ui.esc(s.closeReason)}</dd></div>` : "")
                + `</dl>`
                + `<h3 style="font-size:.85rem;margin:1rem 0 .4rem">History (${(d.history || []).length})</h3>`
                + ((d.history || []).length === 0 ? `<p class="sub">No history recorded.</p>` : `<ul class="history-list">` + d.history.slice(0, 10).map((h) => `<li><strong>${ui.esc(h.event || "?")}</strong><div class="hm">${h.actorId ? "by " + ui.esc(ui.shortId(h.actorId)) + " · " : ""}${ui.relTime(h.createdAt)}${h.details ? " · " + ui.esc(String(h.details).slice(0, 120)) : ""}</div></li>`).join("") + `</ul>`)
                + `<h3 style="font-size:.85rem;margin:1rem 0 .4rem">Notes (${(d.notes || []).length})</h3>`
                + ((d.notes || []).length === 0 ? `<p class="sub">No staff notes.</p>` : d.notes.slice(0, 5).map((n) => `<div class="note-card">${ui.esc(n.content)}<div class="nm">${ui.esc(n.authorTag || ui.shortId(n.authorId))} · ${ui.relTime(n.createdAt)}</div></div>`).join(""));
            const isOpen = s.status !== "CLOSED";
            modal.open({
                title: "Ticket #" + String(ticketId).slice(0, 8), desc: null, bodyHtml: body, wide: true,
                actions: [
                    { label: "Close", kind: "btn-secondary", onClick: () => { modal.close(); } },
                    isOpen
                        ? { label: "Close ticket", kind: "btn-danger", onClick: () => closeTicket(ticketId) }
                        : { label: "Reopen ticket", kind: "btn-primary", onClick: () => reopenTicket(ticketId) },
                ],
            });
            ui.hydrateTimes(document);
        } catch (e) {
            modal.open({ title: "Ticket #" + String(ticketId).slice(0, 8), desc: e.message || "Could not load ticket details.", actions: [{ label: "Close", kind: "btn-secondary", onClick: () => modal.close() }] });
        }
    }

    async function closeTicket(ticketId) {
        const okGo = await window.Pulse.modal.confirm({ title: "Close ticket?", desc: "The ticket channel will be closed. This can be reopened later.", confirmText: "Close ticket", requireText: "CLOSE" });
        if (!okGo) return;
        try {
            await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/tickets/" + encodeURIComponent(ticketId) + "/close", { method: "POST", body: JSON.stringify({}) });
            window.Pulse.toast("Ticket closed.", "ok");
            load();
        } catch (e) { window.Pulse.toast(e.message || "Failed to close ticket.", "err"); }
    }

    async function reopenTicket(ticketId) {
        try {
            await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/tickets/" + encodeURIComponent(ticketId) + "/reopen", { method: "POST", body: JSON.stringify({}) });
            window.Pulse.toast("Ticket reopened.", "ok");
            load();
        } catch (e) { window.Pulse.toast(e.message || "Failed to reopen ticket.", "err"); }
    }

    async function load() {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const body = document.getElementById("ticketsBody");
        const sub = document.getElementById("ticketsSub");
        gid = window.Pulse.router.guildIdFromPath();
        const params = new URLSearchParams(window.location.search);
        const initialQ = params.get("q") || "";
        try {
            if (!gid) throw Object.assign(new Error("No guild selected."), { status: 400 });
            const data = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/tickets");
            allTickets = data.openTickets || [];
            typeById = {};
            (data.ticketTypes || []).forEach((t) => { typeById[t.id] = t.displayName || t.key; });
            if (sub) sub.textContent = `${allTickets.length} shown · up to 50 most recent`;
            if (allTickets.length === 0) {
                body.innerHTML = ui.emptyState(icons.ticket, "No open tickets", "There are currently no open tickets for this server.");
                return;
            }
            body.innerHTML = toolbarHtml(initialQ)
                + `<div class="table-wrap"><table id="ticketTable"><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Creator</th><th scope="col">Priority</th><th scope="col">Opened</th></tr></thead><tbody>`
                + allTickets.map(rowHtml).join("")
                + `<tr id="noFilterResults" style="display:none"><td colspan="5" style="text-align:center;color:var(--text-2);padding:1.6rem">No tickets match the current filters.</td></tr>`
                + `</tbody></table></div><p class="count-note" id="ticketCount" aria-live="polite">${allTickets.length} shown</p>`;
            const typeSel = document.getElementById("typeFilter");
            if (typeSel) {
                Object.entries(typeById).forEach(([id, name]) => {
                    const o = document.createElement("option");
                    o.value = id; o.textContent = name;
                    typeSel.appendChild(o);
                });
            }
            ["ticketSearch", "statusFilter", "priorityFilter", "typeFilter"].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(id === "ticketSearch" ? "input" : "change", applyFilter);
            });
            document.querySelectorAll("#ticketTable tbody tr[data-ticket]").forEach((r) => {
                const open = () => openDetail(r.getAttribute("data-ticket"));
                r.addEventListener("click", open);
                r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
            });
            pager = ui.createPager(document.querySelector("#ticketTable tbody"), document.getElementById("ticketCount"), 15);
            applyFilter();
            ui.hydrateTimes(document);
        } catch (e) {
            const msg = e.status === 403 ? "You do not have access to this server." : (e.message || "Could not load tickets.");
            if (sub) sub.textContent = "Unavailable";
            body.innerHTML = ui.errorState(icons.alert, "Could not load tickets", msg);
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
