/* components/modal.js — reusable confirmation + content modal.
   Pulse.confirm({title, desc, confirmText, danger}) -> Promise<boolean>
   Pulse.showModal({title, bodyHtml, actions}) for read-only detail views. */
(function () {
    window.Pulse = window.Pulse || {};

    function ensureShell(wide) {
        let back = document.getElementById("modalBackdrop");
        if (!back) {
            back = document.createElement("div");
            back.className = "modal-backdrop";
            back.id = "modalBackdrop";
            back.hidden = true;
            back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">'
                + '<h2 id="modalTitle"></h2><p class="modal-sub" id="modalDesc"></p>'
                + '<div id="modalBody"></div>'
                + '<div class="modal-actions" id="modalActions"></div></div>';
            document.body.appendChild(back);
            back.addEventListener("click", (e) => { if (e.target === back) close(); });
            document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
        }
        back.querySelector(".modal").classList.toggle("modal-wide", !!wide);
        return back;
    }

    function close() {
        const back = document.getElementById("modalBackdrop");
        if (back) back.hidden = true;
    }

    function open({ title, desc, bodyHtml, actions, wide }) {
        const back = ensureShell(wide);
        back.querySelector("#modalTitle").textContent = title || "Confirm";
        const d = back.querySelector("#modalDesc");
        d.textContent = desc || "";
        d.style.display = desc ? "" : "none";
        back.querySelector("#modalBody").innerHTML = bodyHtml || "";
        const box = back.querySelector("#modalActions");
        box.innerHTML = "";
        (actions || []).forEach((a) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn " + (a.kind || "btn-secondary");
            b.textContent = a.label;
            b.addEventListener("click", () => { close(); if (a.onClick) a.onClick(); });
            box.appendChild(b);
        });
        back.hidden = false;
        const first = box.querySelector("button");
        if (first) first.focus();
    }

    function confirm({ title, desc, confirmText, danger }) {
        return new Promise((resolve) => {
            open({
                title: title || "Are you sure?",
                desc,
                actions: [
                    { label: "Cancel", kind: "btn-secondary", onClick: () => resolve(false) },
                    { label: confirmText || "Confirm", kind: danger === false ? "btn-primary" : "btn-danger", onClick: () => resolve(true) },
                ],
            });
            const back = document.getElementById("modalBackdrop");
            const cancelOnBackdrop = (e) => {
                if (e.target === back) { back.removeEventListener("click", cancelOnBackdrop); resolve(false); }
            };
            back.addEventListener("click", cancelOnBackdrop);
        });
    }

    window.Pulse.modal = { open, close, confirm };
})();
