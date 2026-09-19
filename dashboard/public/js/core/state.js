/* core/state.js — cached session + guild lookups for components. */
(function () {
    window.Pulse = window.Pulse || {};
    let sessionPromise = null;
    let guildsPromise = null;

    function loadSession() {
        if (!sessionPromise) {
            sessionPromise = window.Pulse.apiFetch("/api/user").catch((e) => {
                sessionPromise = null;
                throw e;
            });
        }
        return sessionPromise;
    }

    function loadGuilds() {
        if (!guildsPromise) {
            guildsPromise = window.Pulse.apiFetch("/api/guilds").catch((e) => {
                guildsPromise = null;
                throw e;
            });
        }
        return guildsPromise;
    }

    window.Pulse.state = { loadSession, loadGuilds };
})();
