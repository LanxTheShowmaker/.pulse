/* pages/login.js — already-authenticated users skip OAuth. */
(function () {
    async function boot() {
        const params = new URLSearchParams(window.location.search);
        const err = params.get("error");
        if (err) {
            const box = document.getElementById("loginError");
            if (box) { box.hidden = false; box.textContent = err; }
        }
        try {
            const res = await fetch("/api/user", { credentials: "same-origin" });
            if (res.ok) window.location.href = "/select-server";
        } catch (e) { /* logged out: stay on the login page */ }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
