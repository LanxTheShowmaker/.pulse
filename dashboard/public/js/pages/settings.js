/* pages/settings.js — real guild config forms bound to the PATCH API. */
(function () {
    const { apiFetch } = window.Pulse;
    let gid = null;
    let lastSaved = null;

    function fieldRow(id, name, label, hint, value, extra) {
        const ui = window.Pulse.ui;
        return `<div class="field"><label for="${id}">${ui.esc(label)}</label><small class="hint">${ui.esc(hint)}</small>`
            + `<input class="input" id="${id}" name="${name}" type="text"${extra || ""} value="${ui.esc(value ?? "")}" autocomplete="off"></div>`;
    }

    function renderForm(config) {
        const ui = window.Pulse.ui;
        lastSaved = JSON.parse(JSON.stringify(config));
        const arr = (v) => (Array.isArray(v) ? v.join(", ") : "");
        const pretty = (v) => {
            try { return typeof v === "string" ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v, null, 2); }
            catch (e) { return String(v ?? ""); }
        };
        let modules = {};
        try { modules = typeof config.modules === "string" ? JSON.parse(config.modules || "{}") : (config.modules || {}); }
        catch (e) { modules = {}; }
        const modKeys = Object.keys(modules);
        const channels = [
            ["logChannelId", "Log channel", "General event log"],
            ["modLogChannelId", "Mod log channel", "Moderation actions"],
            ["welcomeChannelId", "Welcome channel", "New member greetings"],
            ["goodbyeChannelId", "Goodbye channel", "Member farewells"],
            ["ticketCategoryId", "Ticket category", "Category for ticket channels"],
            ["ticketLogChannelId", "Ticket log channel", "Ticket transcripts and events"],
        ];
        return `<form id="settingsForm" novalidate>`
            + `<div class="panel settings-section"><div class="panel-header"><div><h2>General</h2><p>Basic bot behaviour for this server.</p></div></div><div class="panel-body">`
            + `<div class="field"><label for="f-prefix">Command prefix</label><small class="hint">Prefix the bot listens for, e.g. !</small><input class="input" id="f-prefix" name="prefix" type="text" maxlength="8" value="${ui.esc(config.prefix || "!")}" autocomplete="off" style="max-width:120px"></div>`
            + `</div></div>`
            + `<div class="panel settings-section"><div class="panel-header"><div><h2>Channels</h2><p>Channel IDs used for logging, welcomes and tickets. Leave blank to disable.</p></div></div><div class="panel-body"><div class="form-grid">`
            + channels.map(([k, lb, hint]) => fieldRow("f-" + k, k, lb, hint, config[k] ?? "", ' inputmode="numeric" placeholder="Channel ID"')).join("")
            + `</div></div></div>`
            + `<div class="panel settings-section"><div class="panel-header"><div><h2>Roles</h2><p>Comma-separated role IDs. Staff can manage tickets; moderators get extra permissions.</p></div></div><div class="panel-body"><div class="form-grid">`
            + fieldRow("f-staff", "staffRoleIds", "Staff role IDs", "e.g. 123…, 456…", arr(config.staffRoleIds), ' placeholder="123…, 456…"')
            + fieldRow("f-mod", "moderatorRoleIds", "Moderator role IDs", "e.g. 123…, 456…", arr(config.moderatorRoleIds), ' placeholder="123…, 456…"')
            + `</div></div></div>`
            + (modKeys.length > 0
                ? `<div class="panel settings-section"><div class="panel-header"><div><h2>Modules</h2><p>Toggle bot modules for this server.</p></div></div><div class="panel-body">`
                + modKeys.map((k) => `<div class="switch-row"><div class="t"><strong>${ui.esc(k)}</strong><small>module.${ui.esc(k)}</small></div><label class="switch"><input type="checkbox" data-module="${ui.esc(k)}"${modules[k] ? " checked" : ""} aria-label="Toggle ${ui.esc(k)}"><span class="track" aria-hidden="true"></span></label></div>`).join("")
                + `</div></div>`
                : ``)
            + `<div class="panel settings-section"><div class="panel-header"><div><h2>Advanced</h2><p>Read-only state. These are managed by bot commands.</p></div></div><div class="panel-body">`
            + `<div class="field"><span class="lbl" id="adv-modules">Modules (raw)</span><pre class="codeblock" aria-labelledby="adv-modules">${ui.esc(pretty(config.modules))}</pre></div>`
            + `<div class="field"><span class="lbl" id="adv-automod">Automod</span><pre class="codeblock" aria-labelledby="adv-automod">${ui.esc(pretty(config.automod))}</pre></div>`
            + `<div class="field"><span class="lbl" id="adv-orders">Orders</span><pre class="codeblock" aria-labelledby="adv-orders">${ui.esc(pretty(config.orders))}</pre></div>`
            + `</div></div>`
            + `<div class="savebar"><button class="btn btn-primary" id="saveSettings" type="submit">Save changes</button>`
            + `<button class="btn btn-secondary" id="resetSettings" type="button">Reset</button>`
            + `<span class="form-status" id="formStatus" aria-live="polite"></span></div></form>`;
    }

    function fillForm(config) {
        const form = document.getElementById("settingsForm");
        if (!form || !config) return;
        const set = (name, v) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = v ?? ""; };
        set("prefix", config.prefix || "!");
        ["logChannelId", "modLogChannelId", "welcomeChannelId", "goodbyeChannelId", "ticketCategoryId", "ticketLogChannelId"].forEach((k) => set(k, config[k] ?? ""));
        set("staffRoleIds", Array.isArray(config.staffRoleIds) ? config.staffRoleIds.join(", ") : "");
        set("moderatorRoleIds", Array.isArray(config.moderatorRoleIds) ? config.moderatorRoleIds.join(", ") : "");
        let modules = {};
        try { modules = typeof config.modules === "string" ? JSON.parse(config.modules || "{}") : {}; } catch (e) { /* ignore */ }
        form.querySelectorAll("input[data-module]").forEach((t) => { t.checked = !!modules[t.getAttribute("data-module")]; });
    }

    async function save(form) {
        const btn = document.getElementById("saveSettings");
        const status = document.getElementById("formStatus");
        if (btn) { btn.disabled = true; btn.classList.add("is-loading"); }
        if (status) { status.className = "form-status"; status.textContent = "Saving…"; }
        const fd = new FormData(form);
        const str = (k) => { const v = (fd.get(k) || "").toString().trim(); return v === "" ? null : v; };
        const idList = (k) => (fd.get(k) || "").toString().split(",").map((s) => s.trim()).filter(Boolean);
        const payload = {
            prefix: str("prefix") || "!",
            logChannelId: str("logChannelId"), modLogChannelId: str("modLogChannelId"),
            welcomeChannelId: str("welcomeChannelId"), goodbyeChannelId: str("goodbyeChannelId"),
            ticketCategoryId: str("ticketCategoryId"), ticketLogChannelId: str("ticketLogChannelId"),
            staffRoleIds: JSON.stringify(idList("staffRoleIds")),
            moderatorRoleIds: JSON.stringify(idList("moderatorRoleIds")),
        };
        const mods = {};
        form.querySelectorAll("input[data-module]").forEach((t) => { mods[t.getAttribute("data-module")] = t.checked; });
        if (Object.keys(mods).length) payload.modules = JSON.stringify(mods);
        try {
            const saved = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/config", { method: "PATCH", body: JSON.stringify(payload) });
            lastSaved = saved;
            if (status) { status.className = "form-status ok"; status.textContent = "Saved."; }
            window.Pulse.toast("Settings saved.", "ok");
        } catch (e) {
            if (status) { status.className = "form-status err"; status.textContent = e.message || "Save failed."; }
            window.Pulse.toast(e.message || "Save failed.", "err");
        } finally {
            if (btn) { btn.disabled = false; btn.classList.remove("is-loading"); }
        }
    }

    async function load() {
        const ui = window.Pulse.ui;
        const icons = window.Pulse.icons;
        const body = document.getElementById("settingsBody");
        gid = window.Pulse.router.guildIdFromPath();
        try {
            if (!gid) throw Object.assign(new Error("No guild selected."), { status: 400 });
            const config = await apiFetch("/api/guild/" + encodeURIComponent(gid) + "/config");
            if (!config) throw new Error("No configuration found.");
            body.innerHTML = renderForm(config);
            const form = document.getElementById("settingsBody").querySelector("#settingsForm") || document.getElementById("settingsForm");
            form.addEventListener("submit", (e) => { e.preventDefault(); save(form); });
            document.getElementById("resetSettings").addEventListener("click", async () => {
                const okGo = await window.Pulse.modal.confirm({
                    title: "Discard changes?",
                    desc: "Unsaved edits will be replaced with the last saved values.",
                    confirmText: "Discard",
                });
                if (!okGo) return;
                fillForm(lastSaved);
                const s = document.getElementById("formStatus");
                if (s) { s.className = "form-status"; s.textContent = ""; }
                window.Pulse.toast("Unsaved changes discarded.", "info");
            });
        } catch (e) {
            const msg = e.status === 403 ? "You do not have access to this server." : (e.message || "Could not load settings.");
            body.innerHTML = ui.errorState(icons.alert, "Could not load settings", msg);
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
