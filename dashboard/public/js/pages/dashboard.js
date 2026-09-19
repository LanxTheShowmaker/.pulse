/* pages/dashboard.js — guild overview: real metrics, activity, status. */
(function () {
    const { apiFetch } = window.Pulse;

    function statCard(label, value, sub, icon, live) {
        const dot = live === true ? `<span class="dot on" aria-hidden="true"></span> ` : live === false ? `<span class="dot off" aria-hidden="true"></span> ` : "";
        return `<div class="stat-card"><div class="ic" aria-hidden="true">${icon}</div><div style="min-width:0"><div class="lb">${label}</div><div class="vl">${dot}${value}</div><div class="sb">${sub}</div></div></div>`;
    }

    async function load() {
        const gid = window.Pulse.router.guildIdFromPath();
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const grid = document.getElementById("statGrid");
        try {
            if (!gid) throw Object.assign(new Error("No guild selected."), { status: 400 });
            const o = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/overview");
            const desc = document.getElementById("pageDesc");
            if (desc) {
                const bits = [];
                if (o.guild.name) bits.push("<strong>" + ui.esc(o.guild.name) + "</strong>");
                if (o.guild.memberCount != null) bits.push(o.guild.memberCount.toLocaleString() + " members");
                bits.push("live data from .pulse");
                desc.innerHTML = "Overview for " + bits.join(" · ") + ".";
            }
            grid.innerHTML =
                statCard("Open tickets", ui.esc(o.stats.open), "needs attention", icons.ticket) +
                statCard("Closed tickets", ui.esc(o.stats.closed), ui.esc(o.stats.total) + " total", icons.check) +
                statCard("Recent cases", ui.esc(o.recentCases.length), "latest moderation activity", icons.shield) +
                (o.bot.online
                    ? statCard("Bot status", "Online", o.bot.ping != null ? o.bot.ping + " ms latency" : "connected", icons.pulse, true)
                    : statCard("Bot status", "Starting", "bot not connected yet", icons.pulse, false));

            const tRows = o.recentTickets.map((t) => {
                const staff = t.claimedById || t.assignedById;
                return `<tr><td class="mono">#${ui.esc(String(t.id).slice(0, 8))}</td><td>${ui.statusBadge(t.status)}</td>`
                    + `<td><div>${ui.esc(ui.shortId(t.openerId))}</div><div class="sub">${staff ? "→ " + ui.esc(ui.shortId(staff)) : "Unassigned"}</div></td>`
                    + `<td>${ui.priorityBadge(t.priority)}</td><td>${ui.relTime(t.createdAt)}</td></tr>`;
            }).join("");
            document.getElementById("ticketsPanel").innerHTML = o.recentTickets.length === 0
                ? ui.emptyState(icons.ticket, "No open tickets", "New support tickets will appear here as soon as members open them.")
                : `<div class="table-wrap"><table><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th><th scope="col">Creator</th><th scope="col">Priority</th><th scope="col">Opened</th></tr></thead><tbody>${tRows}</tbody></table></div>`;
            document.getElementById("ticketsMore").innerHTML = `<a class="more" href="/dashboard/guild/${encodeURIComponent(gid)}/tickets">View all tickets →</a>`;

            document.getElementById("modPanel").innerHTML = o.recentCases.length === 0
                ? ui.emptyState(icons.shield, "No moderation actions yet", "Cases will appear here once moderators take action.")
                : `<ol class="timeline">${o.recentCases.map((c) => `<li><div class="fb"><strong>#${ui.esc(c.caseNumber)} ${ui.esc(c.action || "Action")}</strong> — ${ui.esc(c.targetTag || c.targetId || "unknown")}<div class="fm">Moderator ${ui.esc(c.moderatorTag || "unknown")} · ${ui.relTime(c.createdAt)}${c.reason ? " · " + ui.esc(String(c.reason).slice(0, 90)) : ""}${c.resolved ? " · resolved" : ""}</div></div></li>`).join("")}</ol>`;
            document.getElementById("modMore").innerHTML = `<a class="more" href="/dashboard/guild/${encodeURIComponent(gid)}/moderation">View all</a>`;

            const snap = o.configSnapshot;
            document.getElementById("serverPanel").innerHTML = `<dl>`
                + `<div class="kv"><dt>Server</dt><dd class="plain">${ui.esc(o.guild.name || ui.shortId(gid))}</dd></div>`
                + `<div class="kv"><dt>Members</dt><dd class="plain">${o.guild.memberCount != null ? o.guild.memberCount.toLocaleString() : "unknown"}</dd></div>`
                + `<div class="kv"><dt>Command prefix</dt><dd><code class="mono">${ui.esc(snap.prefix)}</code></dd></div>`
                + `<div class="kv"><dt>Channels configured</dt><dd class="plain">${snap.channelsSet} of ${snap.channelFields}</dd></div>`
                + `<div class="kv"><dt>Staff roles</dt><dd class="plain">${snap.staffRoles}</dd></div>`
                + `<div class="kv"><dt>Moderator roles</dt><dd class="plain">${snap.modRoles}</dd></div></dl>`;
            document.getElementById("serverMore").innerHTML = `<a class="more" href="/dashboard/guild/${encodeURIComponent(gid)}/settings">Settings</a>`;

            document.getElementById("botPanel").innerHTML = `<dl>`
                + `<div class="kv"><dt>Bot</dt><dd class="plain">${o.bot.online ? '<span class="badge b-success">Online</span>' : '<span class="badge b-muted">Starting</span>'}</dd></div>`
                + `<div class="kv"><dt>Account</dt><dd>${o.bot.tag ? ui.esc(o.bot.tag) : "—"}</dd></div>`
                + `<div class="kv"><dt>Discord latency</dt><dd class="plain">${o.bot.ping != null ? o.bot.ping + " ms" : "—"}</dd></div>`
                + `<div class="kv"><dt>Database</dt><dd class="plain">${o.bot.dbOk ? '<span class="badge b-success">Connected</span>' : '<span class="badge b-danger">Offline</span>'}</dd></div></dl>`;

            document.getElementById("quickActions").innerHTML =
                `<a class="action-link" href="/dashboard/guild/${encodeURIComponent(gid)}/tickets">${icons.ticket}<span>Manage tickets<small>Review open tickets and their status</small></span></a>`
                + `<a class="action-link" href="/dashboard/guild/${encodeURIComponent(gid)}/moderation">${icons.shield}<span>Review moderation<small>Recent cases and actions</small></span></a>`
                + `<a class="action-link" href="/dashboard/guild/${encodeURIComponent(gid)}/settings">${icons.settings}<span>Server settings<small>Prefix, channels and roles</small></span></a>`;
            ui.hydrateTimes(document);
        } catch (e) {
            const msg = e.status === 403 ? "You do not have access to this server." : (e.message || "Could not load the overview.");
            grid.innerHTML = ui.errorState(window.Pulse.icons.alert, "Could not load dashboard", msg);
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
