# Opsight — Local Setup

Gets both applications running with seeded data. Takes about five minutes.

---

## Requirements

| Tool | Minimum | Verified with |
| --- | --- | --- |
| PHP | 8.2 | 8.2.12 (XAMPP) |
| Composer | 2.x | 2.9.3 |
| Node.js | 20 | 24.13.0 |
| npm | 10 | 11.6.2 |
| MySQL / MariaDB | MySQL 8.0 · MariaDB 10.4 | MariaDB 10.4.32 (XAMPP) |

Required PHP extensions: `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`,
`ctype`, `json`, `bcmath`, `fileinfo`, `curl`, `zip`.

**npm is the package manager.** `pnpm` and `yarn` are not used.

## 1. Databases

Start MySQL/MariaDB, then create both schemas. The second is for the test suite,
which runs against a real engine rather than SQLite (TESTING_STRATEGY.md §3).

```sql
CREATE DATABASE opsight       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE opsight_test  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

With XAMPP on Windows:

```bash
/d/xampp/mysql/bin/mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS opsight CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE IF NOT EXISTS opsight_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## 2. Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve --port=8010
```

The API is now on `http://localhost:8010`. Check it:

```bash
curl http://localhost:8010/api/v1/health
```

Adjust `DB_USERNAME` / `DB_PASSWORD` in `.env` if your MySQL root user has a password.

## 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## 4. Sign in

The seeder creates one account per role. All use the password `password`.

| Role | Email | Sees |
| --- | --- | --- |
| Owner | `owner@opsight.test` | Everything, including users and settings |
| Manager | `manager@opsight.test` | All operations and financials, no user management |
| Analyst | `analyst@opsight.test` | Reads and exports everything, writes nothing |
| Staff | `staff@opsight.test` | Orders and customers only — **no cost, margin, profit or expenses** |

Sign in as Staff and then as Owner to see the authorization boundary: the
difference is produced entirely server-side, not hidden in the browser.

## No hosts-file entries needed

Sanctum's SPA cookie mode needs the frontend and API to share a cookie domain.
**Cookies ignore port numbers**, so `localhost:8010` and `localhost:3000` already
share one and no `hosts` entry is required.

This supersedes the note in ADR-002, which assumed `app.opsight.test` /
`api.opsight.test` would be necessary in development. Sibling subdomains are
still required in **production**:

```ini
# backend/.env
SESSION_DOMAIN=.opsight.com
SANCTUM_STATEFUL_DOMAINS=app.opsight.com
SESSION_SECURE_COOKIE=true
FRONTEND_URL=https://app.opsight.com

# frontend/.env.local
NEXT_PUBLIC_API_URL=https://api.opsight.com
```

## Demo data

`php artisan migrate --seed` gives a clean install: business settings, one
account per role, and a second business (Al Noor Trading, `owner@alnoor.test`)
so that the isolation between businesses can be seen in a browser. A fresh
deployment must not arrive pre-populated with orders that never happened, so the
three years of history are opt-in — set `SEED_DEMO_DATA=true` in `backend/.env`,
or call the seeder directly.

To load three years of realistic history for development or a demo:

```bash
php artisan db:seed --class=DemoDataSeeder
```

It takes a couple of minutes and produces roughly 2,300 orders, 5,500 order
lines, 40 products, 68 customers and 290 expenses across 36 months.

The data is deliberately **not** a uniform sprinkle — evenly distributed seed
data hides exactly the bugs a BI system needs to catch. It includes:

- seasonal and weekday variation in order volume,
- every order status, including cancellations and refunds,
- **products whose price and cost changed mid-history**, so over half of all
  order lines carry a `unit_cost` that differs from the current catalog. If a
  metric ever reads `products.cost` instead of the snapshot, the number is
  visibly wrong rather than quietly wrong,
- customers with one order, with many, and with none,
- walk-in orders with no customer, which new-customer metrics must exclude,
- backdated expenses.

Every order is created through the real `ConfirmOrder` service, so the inventory
ledger invariant holds across the whole dataset.

## Component gallery

In development only, `http://localhost:3000/gallery` renders every UI component in every
state — loading, empty, filtered-empty, error — in whichever theme your OS is set to.

It is the fastest way to check a component you are changing, and switching your system theme
to dark while it is open is the fastest way to catch an unreadable token. It is excluded from
production and does not appear in navigation outside development.

## Running the checks

**Backend**

```bash
cd backend
composer run check      # formatting + static analysis + tests
./vendor/bin/pest       # tests only
./vendor/bin/pint       # apply formatting
```

**Frontend**

```bash
cd frontend
npm run lint            # includes the RTL logical-properties rule
npm run test            # Vitest
npm run build
```

**End to end** — needs the API running with the demo history seeded, because the
specs read real orders, low stock and activity:

```bash
cd backend
echo "SEED_DEMO_DATA=true" >> .env      # once
php artisan migrate:fresh --seed && php artisan serve --port=8010

cd frontend && npx playwright install chromium && npm run e2e
```

The owner account's interface language is Arabic in the seeded data if you have
changed it; the specs read English labels, so switch it back before a run
(`/settings` or the account menu) — CI starts from a fresh seed and is not
affected.

## Troubleshooting

**`SQLSTATE[HY000] [2002]`** — MySQL is not running. Start it from the XAMPP
control panel, or check that port 3306 is listening.

**419 on login** — the CSRF cookie was not set. Confirm `NEXT_PUBLIC_API_URL`
matches the address the API is actually served on, and that `FRONTEND_URL` in
`backend/.env` matches the frontend's origin exactly, scheme and port included.

**CORS error in the browser console** — `FRONTEND_URL` in `backend/.env` does not
match the browser's origin. Credentialed requests cannot use a wildcard origin,
so it must match exactly.

**401 immediately after a successful login** — `SESSION_DOMAIN` and
`SANCTUM_STATEFUL_DOMAINS` disagree. Locally they should be `localhost` and
`localhost:3000`.

**Tests fail with "database does not exist"** — `opsight_test` was not created.
See step 1.
