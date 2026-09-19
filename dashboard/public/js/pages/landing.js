/* pages/landing.js — public homepage. If a session already exists,
   point every CTA at server selection instead of login. */
(function () {
    async function boot() {
        try {
            const res = await fetch("/api/user", { credentials: "same-origin" });
            if (!res.ok) return;
            document.querySelectorAll("[data-cta]").forEach((a) => {
                a.setAttribute("href", "/select-server");
            });
        } catch (e) { /* logged out: CTAs keep pointing at /login */ }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
