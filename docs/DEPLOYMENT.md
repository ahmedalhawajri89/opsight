# Opsight — The Public Demo on Vercel

How the live demo is deployed: the API and the frontend as two Vercel projects,
a MySQL-compatible database on TiDB Cloud, and a nightly reset. For running
Opsight on your own machine, see [SETUP.md](SETUP.md).

The demo is a production installation with `DEMO_MODE` on (`config/demo.php`).
That one switch does three things, and nothing else in the code knows it is a
demo:

- it seeds the demo accounts, the second business and three years of history,
  which a real installation never receives;
- it keeps the demo accounts themselves unchangeable — password, email, role and
  status — so one visitor cannot lock the next one out (`ProtectDemoAccounts`);
- it lets `demo:reset` replace every table with the committed snapshot.

---

## How the pieces fit

```
browser ──► opsight-demo.vercel.app            (Next.js, frontend/)
              │  /api/v1/*, /sanctum/*  rewritten (next.config.mjs)
              ▼
            opsight-demo-api.vercel.app        (Laravel, backend/, vercel-php)
              │
              ▼
            TiDB Cloud Starter                 (MySQL-compatible, TLS)
```

**Why the proxy.** Sign-in is a Sanctum session cookie (ADR-002), which only
works when the browser sees the app and the API as one site. Two
`*.vercel.app` addresses can never share a cookie — `vercel.app` is a public
suffix — so the frontend forwards the API's two paths to it. The browser only
ever talks to the frontend's origin, and the session cookie is that origin's.
With a domain of your own, the API can instead sit on a sibling subdomain and
the proxy is simply not configured (leave `API_ORIGIN` unset).

**Why a snapshot.** Seeding three years of history takes minutes, because
`DemoDataSeeder` writes every order through the real domain code. A Vercel
function is stopped after a minute. So the seeded state is saved once in
`backend/database/demo/` (one gzipped JSON file per table) and restored in bulk
in seconds, every date moved forward by the whole weeks since it was taken
(`App\Support\DemoSnapshot`), so the history always ends this week.

---

## 1. The database (TiDB Cloud)

1. Create a **TiDB Cloud Starter** cluster in a region near Frankfurt (the
   functions run in `fra1`).
2. Create a database, e.g. `opsight`, and note the host, port, user and
   password from **Connect**. Connections require TLS.
3. Nothing else is needed by hand. `demo:reset` turns on TiDB's
   `tidb_enable_check_constraint` before migrating: TiDB accepts CHECK
   constraints but by default neither keeps nor enforces them, and the
   migrations both rely on them and drop some of them by name.

## 2. The API project (`backend/`)

Create a Vercel project from the repository with **Root Directory**
`backend`. `vercel.json` already declares the PHP runtime (`vercel-php`), the
routes and the nightly cron. Environment variables:

| Variable | Value |
| --- | --- |
| `APP_NAME` | `Opsight` |
| `APP_ENV` | `production` |
| `APP_KEY` | output of `php artisan key:generate --show` |
| `APP_DEBUG` | `false` |
| `APP_URL` | `https://opsight-demo-api.vercel.app` |
| `FRONTEND_URL` | `https://opsight-demo.vercel.app` |
| `DEMO_MODE` | `true` |
| `DB_CONNECTION` | `mysql` |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | from TiDB |
| `MYSQL_ATTR_SSL_CA` | `/etc/pki/tls/certs/ca-bundle.crt` |
| `SESSION_DRIVER` | `cookie` |
| `SESSION_SECURE_COOKIE` | `true` |
| `SANCTUM_STATEFUL_DOMAINS` | `opsight-demo.vercel.app` |
| `CACHE_STORE` | `database` |
| `QUEUE_CONNECTION` | `sync` |
| `LOG_CHANNEL` | `stderr` |
| `MAIL_MAILER` | `log` |
| `TRUSTED_PROXIES` | `*` |
| `CRON_SECRET` | a long random string |

Leave `SESSION_DOMAIN` **unset**: the cookie belongs to the frontend's host.
The disk is read-only except `/tmp`; `api/_runtime.php` moves storage and the
compiled caches there.

**`QUEUE_CONNECTION=sync` here, and `database` everywhere else.** SETUP.md says
a queue worker is a requirement from Phase 5 on, and on an ordinary server it
is. Serverless functions have no process to run one in, so on this deployment
a queued job runs inline in the request that dispatched it.

That is harmless for the demo as it stands: no webhook provider is registered
(`config/integrations.php` is empty), so `/v1/webhooks/*` is a 404 and no job
is ever dispatched. **It stops being harmless the moment a provider is
registered here** — a delivery handled inside the request is exactly the slow
response that makes a provider time out and retry, which is the duplicate
ADR-027 exists to prevent. Connecting a real store to this demo means moving
the API off serverless, or onto a queue service with its own worker.

## 3. The frontend project (`frontend/`)

A second Vercel project from the same repository, **Root Directory**
`frontend`, framework Next.js:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://opsight-demo.vercel.app` (this project's own address) |
| `API_ORIGIN` | `https://opsight-demo-api.vercel.app` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |

Leave `NEXT_PUBLIC_ENABLE_GALLERY` unset. `NEXT_PUBLIC_DEMO_MODE` adds the
one-click demo accounts to the sign-in page (`DemoAccounts`).

## 4. Filling the database

Once, from your machine, with `backend/.env` pointing at TiDB (the same `DB_*`
and `MYSQL_ATTR_SSL_CA` as above — on Windows, a path to a CA bundle on your
machine) and `DEMO_MODE=true`:

```bash
cd backend
php artisan demo:reset
```

It migrates the schema and restores the snapshot. After that the cron does the
same every night at 01:00 UTC: Vercel calls `/api/demo-reset` with
`Authorization: Bearer <CRON_SECRET>`, and any request without it is refused.

## 5. Checking the deployment

On `https://opsight-demo.vercel.app`:

- each demo account signs in from the sign-in page, and lands on the dashboard;
- Staff does not see what Owner sees (costs, margins, users, settings);
- the Al Noor owner sees only Al Noor, in Kuwaiti dinars;
- the dashboard's last 30 days are full, not a drop to nothing;
- Arabic and English both work, and a CSV export downloads;
- changing a demo account's password, role or status is refused with
  `demo.account_protected`.

The Playwright suite can run against the live address as well. It creates
records as it goes, which the next reset removes:

```bash
cd frontend
E2E_BASE_URL=https://opsight-demo.vercel.app npx playwright test
```

## Refreshing the snapshot

When a migration or the seeders change what the demo should contain, build the
snapshot again on a local database and commit it:

```bash
cd backend
# with DEMO_MODE=true and DB_DATABASE pointing at an empty local database
php artisan migrate:fresh --seed --force
php artisan demo:snapshot
```

A snapshot must be taken straight after seeding: anything done in between,
a test sign-in included, is saved with it and restored every night.
