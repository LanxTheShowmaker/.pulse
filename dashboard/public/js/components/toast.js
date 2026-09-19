/* components/toast.js — toast notifications (success/error/warning/info). */
(function () {
    window.Pulse = window.Pulse || {};

    function toast(msg, type) {
        const box = document.getElementById("toasts");
        if (!box) return;
        const el = document.createElement("div");
        el.className = "toast " + (type || "");
        el.textContent = String(msg);
        box.appendChild(el);
        setTimeout(() => el.remove(), 4200);
    }

    window.Pulse.toast = toast;
})();
