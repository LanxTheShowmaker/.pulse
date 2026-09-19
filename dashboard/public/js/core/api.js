/* core/api.js — authenticated JSON fetch wrapper. Cookies ride
   automatically (same-origin). 401 means the session died: the
   dashboard can only continue after a fresh login. */
(function () {
    window.Pulse = window.Pulse || {};

    async function apiFetch(path, opts) {
        const options = Object.assign({ credentials: "same-origin" }, opts || {});
        options.headers = Object.assign(
            options.body !== undefined ? { "Content-Type": "application/json" } : {},
            options.headers || {},
        );
        let res;
        try {
            res = await fetch(path, options);
        } catch (e) {
            throw Object.assign(new Error("Network error. Is the dashboard reachable?"), { status: 0 });
        }
        if (res.status === 401) {
            window.location.href = "/login";
            throw Object.assign(new Error("Session expired."), { status: 401 });
        }
        const ct = res.headers.get("content-type") || "";
        let data = null;
        try {
            data = ct.includes("json") ? await res.json() : await res.text();
        } catch (e) { data = null; }
        if (!res.ok) {
            const msg = (data && data.error) || ("Request failed (" + res.status + ")");
            throw Object.assign(new Error(msg), { status: res.status, data });
        }
        return data;
    }

    window.Pulse.apiFetch = apiFetch;
})();
