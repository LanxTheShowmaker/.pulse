# .pulse dashboard

Management dashboard for the `.pulse` Discord bot. Started by the bot
(`index.js` imports `./dashboard/index.js` and calls `startServer()`).

## User flow

```text
/                    public homepage (no auth)
  ↓ Access Dashboard
/login               Discord OAuth login (authed users skip to selection)
/auth/discord/callback → session + guild snapshot → /select-server
/select-server       manageable servers (auth required)
  ↓ select guild (server-verified)
  /dashboard/guild/:guildId (+ /tickets, /moderation, /modlog, /settings)
```

Guild context lives in the signed session cookie; every guild-scoped
route re-verifies it server-side. The dashboard never trusts a
browser-supplied guild ID on its own.

## Layout

```text
dashboard/
├── index.js                 # thin bootstrap (app, middleware order, routers)
├── server/
│   ├── middleware/          # auth, validate, errorHandler
│   ├── routes/              # public, auth, guilds, tickets,
│   │                        # moderation, modlog, settings, pages
│   └── services/            # session, oauth, access, guild, overview
└── public/                  # static frontend
    ├── index.html           # public homepage
    ├── login.html           # OAuth login
    ├── select-server.html   # server selection
    ├── 404.html
    ├── dashboard/*.html     # guild, tickets, moderation, modlog, settings
    ├── css/                 # main, landing, auth, server-select,
    │                        # layout, components, pages, responsive
    └── js/
        ├── core/            # api, router, state
        ├── components/      # icons, ui, toast, modal, sidebar,
        │                    # topbar, guildSelector, userMenu
        └── pages/           # landing, login, serverSelect,
                             # dashboard, tickets, moderation, modlog, settings
```

Only `/css` and `/js` are served as static files (public assets).
Every HTML shell is served through an explicit `sendFile` route so
server source, `.env` and Prisma files can never be exposed.

## Rules

- Backend data comes from the existing bot services (`tickets`,
  `moderation`, `logging`, `settings`) and the real Prisma schema.
  No invented relations (e.g. never `include: { TicketType }` —
  resolve `typeId` with an explicit `ticketType.findUnique`).
- `DashboardGuild` rows snapshot the manageable Discord guilds at
  OAuth login (identify+guilds scopes only). Access tokens are never
  stored. Bot presence is always re-checked live, never trusted.
- Ticket mutations resolve the ticket UUID to its `channelId` first,
  because the ticket service `close`/`reopen` operate on channel IDs
  (the bot passes `channel.id`); every ticket/type/case lookup is
  checked against the session guild (403 otherwise).
- `settings.patch` receives an allowlisted, type-checked body
  (`server/middleware/validate.js`); JSON-string columns must parse.
- Destructive UI actions use the shared confirm modal; ticket closure
  additionally requires typing `CLOSE`. The modal is not a security
  boundary — the backend authorizes every mutation independently.
- Required env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `DISCORD_REDIRECT_URI`, `SESSION_SECRET`, `DATABASE_URL`.
