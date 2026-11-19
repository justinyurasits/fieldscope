# Fieldscope — sub safety compliance & validation

Subcontractor safety compliance for general contractors: OSHA-grounded protocols scoped to the task, training and review tracking, and PPE checks against daily site photos. A working pilot-scope prototype with real Postgres persistence, a real API, and a UI meant to be used daily, not clicked through once. Who it's for and why are in the [brief](https://github.com/justinyurasits/design/blob/main/construction-os-demos/fieldscope/brief.md); read that first if you haven't.

**Status:** prototype  
**Design:** [`design/construction-os-demos/fieldscope`](https://github.com/justinyurasits/design/tree/main/construction-os-demos/fieldscope)

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
- OSHA grounding is a small curated library (`server/osha-library.json`), scoped to the pilot trades — deliberately, per the brief's pilot scope, not a shortcut.
- **Cost protection for a public deploy**: an optional shared login gate, and a per-hour cap on the endpoints that call Claude (see [Configuration](#configuration)).

**Not yet real** (see [Known gaps](#known-gaps--read-before-showing-this-to-a-client)): per-user identity, multi-tenancy, photo storage in object storage instead of the database, full OSHA 1926 corpus coverage, any notification beyond the in-app dashboard badge.

## Run it

Needs Node 18+ and a Postgres database. The easiest local Postgres on macOS:

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb fieldscope
```

Or use a free hosted instance from Railway, Render or Neon.

Then, from the repo root:

```bash
cd server
npm install
cp .env.example .env    # then set DATABASE_URL and ANTHROPIC_API_KEY in .env
npm run migrate         # applies schema.sql
npm run seed            # demo subs and sites
npm start               # or: npm run dev, which restarts on changes
```

Open `http://localhost:3000`. The server reads `server/.env`; every setting is described under [Configuration](#configuration).

## Test it

```bash
cd server
npm test
```

This runs `test-smoke.js` against an in-memory Postgres-compatible engine (pg-mem), with the Claude calls stubbed, so it needs no database and no API key. It exercises the whole path — create sub/site, generate a protocol, approve it, attest training, complete a review, upload photos, resolve a flag, check the dashboard — in a few seconds. Every pull request runs it.

## Configuration

Set in `server/.env`. `server/.env.example` lists the same names.

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. |
| `PGSSL` | no | `true` connects to Postgres over SSL (needed for Render Postgres). Default off. |
| `ANTHROPIC_API_KEY` | yes | Key for protocol generation and photo checks. |
| `ANTHROPIC_MODEL` | no | Model used for both calls. Default `claude-sonnet-4-6`. |
| `PORT` | no | Port the server listens on. Default `3000`. |
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` | no | When both are set, every page and API call asks for this one shared username and password. When either is empty, the gate is off — fine locally, not for a public URL. |
| `CLAUDE_CALLS_PER_HOUR` | no | Cap on requests per hour, per client IP, to the two endpoints that call Claude (generate protocol, submit photo check). Default `30`. Past it they return 429. |

## Layout

| Path | What it holds |
| --- | --- |
| `server/` | Express API and Postgres access. `npm` commands run here. |
| `server/index.js` | App entry point: login gate, API routes, static frontend |
| `server/routes.js` | All `/api` routes, including the Claude call cap |
| `server/auth.js` | Optional shared basic-auth login gate |
| `server/db.js` | Postgres pool |
| `server/claude.js` | Claude API calls: protocol generation, photo checks |
| `server/schema.sql`, `server/migrate.js` | Database schema, and the script that applies it |
| `server/seed.js` | Seeds demo subs and sites |
| `server/osha-library.json` | Curated OSHA 1926 knowledge base, scoped to the pilot trades |
| `server/test-smoke.js` | Smoke test against an in-memory Postgres |
| `public/` | Frontend, plain HTML/CSS/JS with no build step. `app.js` is a hash-routed single-page app: dashboard, new protocol, protocol detail. Served by the same Express process. |

## Deploying somewhere real

This needs a host that runs a persistent Node process with a writable connection to Postgres — not a serverless/edge platform. **Railway** or **Render** are the simplest fits. On either, set `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` before sharing the URL.

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

- **One shared login, no user accounts.** The optional login gate keeps strangers out of a public URL, but everyone who has the password is the same user, and with the gate unconfigured anyone with the URL can create protocols and view the dashboard.
- **"Who" fields are free-text prompts, not real identity.** Approving a protocol, attesting training, resolving a flag — all currently capture a typed name via a browser prompt, not an authenticated user. That's honest enough to prove the workflow, but it is not yet a real attestation control — anyone can type any name. Fixing this properly means per-user accounts and tying every "who" field to a logged-in user, not a text box.
- **Single tenant.** One flat list of subs/sites/protocols. Real multi-GC use needs an organization boundary.
- **Photos live in the database as base64**, not object storage. Fine at pilot volume, not fine at scale — moving to S3/R2 with the DB storing just a URL is the natural next step.
- **OSHA library is intentionally narrow** (6 subparts, 5 trades) — matches the pilot's own scope, but expanding it is real work, not a config change.
- **No outbound notifications.** An unresolved flag shows as a badge in the sidebar when someone opens the app, but nothing emails, texts, or pages anyone. The brief assumes a flag at least notifies the Project Safety Manager, so this is a gap against the design, not an open question; what to build is being decided in [design#65](https://github.com/justinyurasits/design/issues/65).

## How work happens

Every change starts as a GitHub issue and lands through a pull request. Design changes happen in the design repository first. See [CLAUDE.md](CLAUDE.md).
