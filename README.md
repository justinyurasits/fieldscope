# Fieldscope — sub safety compliance & validation

A working pilot-scope prototype: real Postgres persistence, a real API, and a UI meant to be used daily, not clicked through once. See `fieldscope-product-concept.md` for the product thinking behind it — read that first if you haven't.

## What's actually real here, and what isn't

**Real:**
- Every protocol, training item, review, and photo check is a persisted, linked Postgres record — refresh the page, restart the server, the record's still there.
- **Protocols start as drafts and require an explicit approval** (name + role) before they're treated as the official record. This matters: an AI-generated protocol is a first draft, not a legal document, until a qualified person signs off on it.
- **Training completion requires attesting who delivered it**, not just a checkbox. Fieldscope tracks task-specific training topics only — it does not generate or substitute for OSHA-10/30 outreach cards, which require an OSHA-authorized trainer and are tracked separately.
- **Reviews (initial and ongoing) are individually completable**, with who completed them and when — this is what makes "overdue" a real, computable state instead of a due date nobody ever closes out.
- **Photo checks support multiple photos per check** (e.g. a wide shot plus a close-up), evaluated together in one Claude vision call, one rolled-up status.
- **Flagged checks require an explicit resolution** — who cleared it, when, with what note. A flag doesn't just quietly age out.
- **Sub-level rollup**: every protocol a sub has had, their training completion rate, and their flag history across all of them — not just one task in isolation.
- **The dashboard triages, not lists**: unresolved flags first, then overdue reviews, then tasks with no check yet today, then everything compliant underneath.
- OSHA grounding is a small curated library (`server/osha-library.json`), scoped to the pilot trades — deliberately, per the product concept's pilot scope, not a shortcut.

**Not yet real** (see "Known gaps" below): auth, multi-tenancy, photo storage in object storage instead of the database, full OSHA 1926 corpus coverage, any notification beyond the in-app dashboard badge.

## Project structure

```
fieldscope/
  server/            Express API + Postgres access
    index.js         App entry point
    routes.js        All /api routes
    db.js            Postgres pool
    claude.js         Claude API calls (protocol generation, photo checks)
    schema.sql        Database schema
    migrate.js        Applies schema.sql
    seed.js           Seeds demo subs/sites
    osha-library.json OSHA 1926 knowledge base (curated, scoped to pilot trades)
    test-smoke.js     Dev-only smoke test (runs against an in-memory Postgres, no real DB needed)
  public/            Frontend (no build step — plain HTML/CSS/JS)
    index.html
    app.js           Hash-routed SPA: dashboard, new protocol, protocol detail
    styles.css
```

## Local setup

1. **Get a Postgres database.** Easiest local option:
   ```bash
   # macOS
   brew install postgresql@16 && brew services start postgresql@16
   createdb fieldscope
   ```
   Or use a free hosted instance from Railway/Render/Neon and skip local Postgres entirely.

2. **Install dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # edit .env:
   #   DATABASE_URL=postgres://localhost:5432/fieldscope   (or your hosted connection string)
   #   ANTHROPIC_API_KEY=sk-ant-...                          (from console.anthropic.com)
   ```

4. **Apply the schema and seed demo subs/sites**
   ```bash
   npm run migrate
   npm run seed
   ```

5. **Run it**
   ```bash
   npm start
   # or npm run dev for auto-restart on changes
   ```
   Open `http://localhost:3000`.

6. **Optional: verify everything works without touching your real database**
   ```bash
   npm test
   ```
   This runs `test-smoke.js` against an in-memory Postgres-compatible engine and exercises the entire path — create sub/site, generate a protocol, toggle training, upload a photo, check the dashboard — in a few seconds. Good first thing to run after cloning, and good to rerun after any route change.

## Deploying somewhere real

This needs a host that runs a persistent Node process with a writable connection to Postgres — not a serverless/edge platform. **Railway** or **Render** are the simplest fits:

**Railway**
1. New project → deploy from this repo, root directory `server/`
2. Add a Postgres plugin — it sets `DATABASE_URL` automatically
3. Add `ANTHROPIC_API_KEY` as an environment variable
4. Set the start command to `npm run migrate && npm start` for the first deploy (or run `npm run migrate` once via the Railway shell)

**Render**
1. New Web Service → connect this repo, root directory `server/`
2. Add a Render Postgres instance, copy its connection string into `DATABASE_URL`, and set `PGSSL=true`
3. Add `ANTHROPIC_API_KEY`
4. Build command `npm install`, start command `npm start`; run `npm run migrate` once via the Render shell

Either way, the frontend is served by the same Express process (`public/` as static files) — there's no separate frontend deploy step.

## Known gaps — read before showing this to a client

- **No auth.** Anyone with the URL can create protocols and view the dashboard. Fine for an internal pilot behind a shared link; not fine for anything client-facing without adding at least a login gate.
- **"Who" fields are free-text prompts, not real identity.** Approving a protocol, attesting training, resolving a flag — all currently capture a typed name via a browser prompt, not an authenticated user. That's honest enough to prove the workflow, but it is not yet a real attestation control — anyone can type any name. Fixing this properly means adding real auth (see above) and tying every "who" field to a logged-in user, not a text box.
- **Single tenant.** One flat list of subs/sites/protocols. Real multi-GC use needs an organization boundary.
- **Photos live in the database as base64**, not object storage. Fine at pilot volume, not fine at scale — moving to S3/R2 with the DB storing just a URL is the natural next step.
- **OSHA library is intentionally narrow** (6 subparts, 5 trades) — matches the pilot's own scope, but expanding it is real work, not a config change.
- **No outbound notifications.** An unresolved flag shows as a badge in the sidebar when someone opens the app, but nothing emails, texts, or pages anyone. Whether it needs to is one of the open questions in the product concept doc.
