/* components/ui.js — shared escaping, badges, timestamps, empty states. */
(function () {
    window.Pulse = window.Pulse || {};

    function esc(v) {
        return String(v ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    function shortId(id) {
        const s = String(id ?? "");
        return s.length > 12 ? s.slice(0, 6) + "…" + s.slice(-4) : s;
    }

    function fmtDate(v) {
        if (!v) return "—";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function relTime(v) {
        if (!v) return "—";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "—";
        return `<time datetime="${esc(d.toISOString())}" data-rel title="${esc(fmtDate(d))}">${esc(fmtDate(d))}</time>`;
    }

    function statusBadge(status) {
        const s = String(status || "OPEN").toUpperCase();
        const cls = s === "OPEN" ? "b-open" : s === "CLAIMED" ? "b-claimed"
            : s === "IN_PROGRESS" ? "b-progress" : s === "WAITING" ? "b-waiting"
            : s === "RESOLVED" ? "b-resolved" : s === "CLOSED" ? "b-closed" : "b-muted";
        return `<span class="badge ${cls}">${esc(s.replace("_", " "))}</span>`;
    }

    function priorityBadge(priority) {
        const p = String(priority || "NORMAL").toUpperCase();
        const cls = p === "URGENT" ? "b-urgent" : p === "HIGH" ? "b-high" : p === "LOW" ? "b-low" : "b-muted";
        return `<span class="badge ${cls}">${esc(p)}</span>`;
    }

    function emptyState(icon, title, text, actionHtml) {
        return `<div class="empty"><div class="ei">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml || ""}</div>`;
    }

    function errorState(icon, title, text) {
        return `<div class="empty"><div class="ei">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p><button type="button" class="btn btn-secondary btn-sm" data-retry>Retry</button></div>`;
    }

    // Progressive enhancement: absolute server timestamps -> relative.
    function hydrateTimes(root) {
        const rel = (d) => {
            let s = Math.floor((Date.now() - d.getTime()) / 1000);
            if (s < 0) s = 0;
            if (s < 60) return s + "s ago";
            const m = Math.floor(s / 60);
            if (m < 60) return m + "m ago";
            const h = Math.floor(m / 60);
            if (h < 24) return h + "h ago";
            const days = Math.floor(h / 24);
            if (days < 30) return days + "d ago";
            return d.toLocaleDateString();
        };
        try {
            (root || document).querySelectorAll("time[data-rel]").forEach((t) => {
                const d = new Date(t.getAttribute("datetime"));
                if (!Number.isNaN(d)) t.textContent = rel(d);
            });
        } catch (e) { /* non-fatal */ }
    }

    window.Pulse.ui = { esc, shortId, fmtDate, relTime, statusBadge, priorityBadge, emptyState, errorState, hydrateTimes };
})();
