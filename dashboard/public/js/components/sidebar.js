/* components/sidebar.js — navigation groups + drawer/collapse behavior. */
(function () {
    const { icons } = window.Pulse;

    const GROUPS = [
        {
            label: "Overview",
            items: [{ href: "/dashboard", icon: "dashboard", label: "Dashboard", active: "dashboard" }],
        },
        {
            label: "Management",
            items: [
                { href: "tickets", icon: "ticket", label: "Tickets", active: "tickets" },
                { href: "moderation", icon: "shield", label: "Moderation", active: "moderation" },
                { href: "modlog", icon: "log", label: "Mod Log", active: "logs" },
            ],
        },
        {
            label: "Configuration",
            items: [{ href: "settings", icon: "settings", label: "Server Settings", active: "settings" }],
        },
    ];

    function guildPath(gid, section) {
        if (!gid) return "/dashboard";
        return "/dashboard/guild/" + encodeURIComponent(gid) + "/" + section;
    }

    function render() {
        const nav = document.getElementById("mainNav");
        if (!nav) return;
        const gid = window.Pulse.router.guildIdFromPath();
        const active = window.Pulse.router.pageName();
        const esc = window.Pulse.ui.esc;
        nav.innerHTML = GROUPS.map((g, gi) => {
            const links = g.items.map((it) => {
                const href = it.href.startsWith("/") ? it.href : guildPath(gid, it.href);
                const isActive = active === it.active;
                return `<a class="nav-link${isActive ? " active" : ""}" href="${esc(href)}"${isActive ? ' aria-current="page"' : ""}>${icons[it.icon] || ""}<span>${esc(it.label)}</span></a>`;
            }).join("");
            return `<p class="nav-group" id="ng-${gi}">${esc(g.label)}</p><div role="group" aria-labelledby="ng-${gi}">${links}</div>`;
        }).join("");
    }

    function behavior() {
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("overlay");
        const navToggle = document.getElementById("navToggle");
        const close = () => {
            if (!sidebar) return;
            sidebar.classList.remove("open");
            if (overlay) overlay.classList.remove("show");
            if (navToggle) navToggle.setAttribute("aria-expanded", "false");
        };
        if (navToggle && sidebar) {
            navToggle.addEventListener("click", () => {
                const open = sidebar.classList.toggle("open");
                if (overlay) overlay.classList.toggle("show", open);
                navToggle.setAttribute("aria-expanded", open ? "true" : "false");
            });
        }
        if (overlay) overlay.addEventListener("click", close);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
        const collapse = document.getElementById("collapseToggle");
        try {
            if (localStorage.getItem("pulse:collapsed") === "1") document.body.classList.add("collapsed");
        } catch (e) { /* ignore */ }
        if (collapse) {
            collapse.addEventListener("click", () => {
                document.body.classList.toggle("collapsed");
                try { localStorage.setItem("pulse:collapsed", document.body.classList.contains("collapsed") ? "1" : "0"); } catch (e) { /* ignore */ }
            });
        }
        // close other <details> menus when one opens
        document.querySelectorAll("details.guild-select,details.user-menu").forEach((d) => {
            d.addEventListener("toggle", () => {
                if (!d.open) return;
                document.querySelectorAll("details.guild-select,details.user-menu").forEach((o) => { if (o !== d && o.open) o.open = false; });
            });
        });
    }

    function init() { render(); behavior(); }

    window.Pulse.sidebar = { init, render };
})();
