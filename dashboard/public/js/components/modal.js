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

    function confirm({ title, desc, confirmText, danger, requireText }) {
        return new Promise((resolve) => {
            let settled = false;
            const done = (v) => { if (!settled) { settled = true; resolve(v); } };
            const need = String(requireText || "").trim();
            const inputHtml = need
                ? `<div class="field" style="margin-top:.6rem"><label for="confirmInput">Type <code class="mono">${window.Pulse.ui.esc(need)}</code> to continue</label><input class="input" id="confirmInput" type="text" autocomplete="off" placeholder="${window.Pulse.ui.esc(need)}"></div>`
                : "";
            open({
                title: title || "Are you sure?",
                desc,
                bodyHtml: inputHtml,
                actions: [
                    { label: "Cancel", kind: "btn-secondary", onClick: () => done(false) },
                    { label: confirmText || "Confirm", kind: danger === false ? "btn-primary" : "btn-danger", onClick: () => done(true) },
                ],
            });
            const back = document.getElementById("modalBackdrop");
            const cancelOnBackdrop = (e) => {
                if (e.target === back) { back.removeEventListener("click", cancelOnBackdrop); done(false); }
            };
            back.addEventListener("click", cancelOnBackdrop);
            if (need) {
                const input = back.querySelector("#confirmInput");
                const yesBtns = back.querySelectorAll("#modalActions .btn");
                const yesBtn = yesBtns[yesBtns.length - 1];
                if (input && yesBtn) {
                    yesBtn.disabled = true;
                    input.addEventListener("input", () => { yesBtn.disabled = input.value.trim() !== need; });
                    input.focus();
                }
            }
        });
    }

    window.Pulse.modal = { open, close, confirm };
})();
