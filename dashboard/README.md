# .pulse dashboard

Management dashboard for the `.pulse` Discord bot. Started by the bot
(`index.js` imports `./dashboard/index.js` and calls `startServer()`).

## Layout

```text
dashboard/
├── index.js                 # thin bootstrap (app, middleware order, routers)
├── server/
│   ├── middleware/          # auth, validate, errorHandler
│   ├── routes/              # auth, api, pages
│   └── services/            # session, oauth, guild, overview
└── public/                  # static frontend (served behind auth)
    ├── dashboard/*.html     # real pages: index, tickets, moderation, modlog, settings
    ├── 404.html
    ├── css/                 # main, layout, components, pages, responsive
    └── js/
        ├── core/            # api, router, state
        ├── components/      # icons, ui, toast, modal, sidebar, topbar, guildSelector, userMenu
        └── pages/           # dashboard, tickets, moderation, modlog, settings
```

## Rules

- Backend data comes from the existing bot services (`tickets`,
  `moderation`, `logging`, `settings`) and the real Prisma schema.
  No invented relations (e.g. never `include: { TicketType }` —
  resolve `typeId` with an explicit `ticketType.findUnique`).
- Ticket mutations resolve the ticket UUID to its `channelId` first,
  because the ticket service `close`/`reopen` operate on channel IDs
  (the bot passes `channel.id`); every ticket/type/case lookup is
  checked against the session guild (403 otherwise).
- `settings.patch` receives an allowlisted, type-checked body
  (`server/middleware/validate.js`); JSON-string columns must parse.
- Static files live strictly under `public/` and are served after
  `requireAuth`, so nothing private (server source, `.env`) is exposed.
- Required env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `DISCORD_REDIRECT_URI`, `SESSION_SECRET`, `DATABASE_URL`.
