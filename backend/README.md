# Opsight — backend

The Laravel API. Read the [root README](../README.md) first; it explains what
Opsight is and how to run both halves together.

## Running it

```bash
composer install
cp .env.example .env
php artisan key:generate

# Optional: three years of realistic history for local work and the browser
# tests. Off by default, because a real installation must not arrive
# pre-populated with invented orders.
echo "SEED_DEMO_DATA=true" >> .env

php artisan migrate --seed
php artisan serve --port=8010
```

MySQL or MariaDB, with a database named in `.env` (`opsight` by default) and a
second one for the tests (`opsight_test`, see `phpunit.xml`). The tests run
against a real MySQL — not SQLite — because the metric queries use MySQL's own
date and timezone functions.

## Checks

```bash
composer run check   # Pint, PHPStan and Pest, in that order
php artisan test     # Pest alone
```

## Where things live

| Path | What it holds |
| --- | --- |
| `app/Domain/` | The business itself: orders, payments, inventory, metrics, tax, insights, audit |
| `app/Http/` | Controllers, form requests and resources — thin, over the domain |
| `app/Authorization/` | Roles and the ability registry, the single source of authorization truth |
| `app/Support/Tenancy/` | How one installation serves many businesses |
| `database/migrations/` | Schema, with the reasoning in the file that made each change |
| `tests/` | Feature tests against real HTTP and a real database, plus unit and concurrency suites |

The decisions behind all of it, including the alternatives rejected, are in
[docs/architecture/DECISIONS.md](../docs/architecture/DECISIONS.md).
