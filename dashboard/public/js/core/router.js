/* core/router.js — guild context comes from the URL path, which the
   server has already authorized. Never invent or default a guild id. */
(function () {
    window.Pulse = window.Pulse || {};

    function guildIdFromPath(path) {
        const m = /^\/dashboard\/guild\/([^/]+)/.exec(path || window.location.pathname);
        return m ? decodeURIComponent(m[1]) : null;
    }

    function pageName() {
        return (document.body && document.body.dataset.page) || "";
    }

    function guildTicketsPath(gid) {
        return "/dashboard/guild/" + encodeURIComponent(gid) + "/tickets";
    }

    window.Pulse.router = { guildIdFromPath, pageName, guildTicketsPath };
})();
