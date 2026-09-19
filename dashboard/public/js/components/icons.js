/* components/icons.js — single SVG icon set (stroke, 16px grid). */
(function () {
    window.Pulse = window.Pulse || {};
    const wrap = (inner) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${inner}</svg>`;
    window.Pulse.icons = {
        dashboard: wrap('<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.2"/>'),
        ticket: wrap('<path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h9A1.5 1.5 0 0 1 14 5.5v1.7a1.8 1.8 0 0 0 0 3.6v1.7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-7Z"/><path d="M10 4v10" stroke-dasharray="1.5 1.5"/>'),
        shield: wrap('<path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.3-5 6.5-2.9-1.2-5-3.3-5-6.5v-4L8 1.5Z"/><path d="m5.8 7.8 1.6 1.6 2.8-3"/>'),
        log: wrap('<path d="M3 2.5h10v11H3z"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>'),
        settings: wrap('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2"/>'),
        menu: wrap('<path d="M2 4.5h12M2 8h12M2 11.5h12"/>').replace('stroke-width="1.5"', 'stroke-width="1.8"'),
        collapse: wrap('<path d="M10 3 5 8l5 5"/>'),
        logout: wrap('<path d="M6 2.5H3.5v11H6M10.5 5 13 8l-2.5 3M13 8H6.5"/>'),
        check: wrap('<path d="m3 8.5 3.2 3L13 4.5"/>').replace('stroke-width="1.5"', 'stroke-width="1.8"'),
        alert: wrap('<circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.2M8 11h.01"/>'),
        search: wrap('<circle cx="7" cy="7" r="4.2"/><path d="m10.3 10.3 3.2 3.2"/>'),
        clock: wrap('<circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.5 1.5"/>'),
        chevron: wrap('<path d="m4 6 4 4 4-4"/>').replace('stroke-width="1.5"', 'stroke-width="1.6"'),
        pulse: wrap('<path d="M1.5 8h3l1.5-3.5 2.5 7L10.5 8h4"/>').replace('stroke-width="1.5"', 'stroke-width="1.6"'),
        x: wrap('<path d="m4 4 8 8M12 4l-8 8"/>').replace('stroke-width="1.5"', 'stroke-width="1.8"'),
    };
})();
