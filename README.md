# Opsight

**Operations & Business Intelligence platform.**

Opsight consolidates a business's operational records — orders, customers, products,
inventory and expenses — and turns them into metrics, comparative analytics and
actionable insights for owners and managers.

> **Status: feature-complete for a single installation, and multi-business.**
> Orders with a payment and refund ledger, customers, products, inventory,
> expenses, analytics with ten insight rules, an audit log, CSV export, four
> roles, Arabic and English throughout, VAT, the Hijri calendar, a configurable
> working week — and, since the tenancy work, many businesses on one
> installation with self-service sign-up and a setup wizard.
>
> Not done: deployment hardening (Phase 06), and the P2 integrations — Salla
> import and WhatsApp alerts. See [docs/ROADMAP.md](docs/ROADMAP.md) and
> [docs/product/MARKET_STUDY.md](docs/product/MARKET_STUDY.md).

---

## Stack

| Layer     | Technology                                        |
| --------- | ------------------------------------------------- |
| Frontend  | Next.js (App Router), React, **JavaScript**, Tailwind CSS |
| Backend   | Laravel, PHP 8.2+, REST API, Laravel Sanctum      |
| Database  | MySQL / MariaDB                                   |

**The frontend is JavaScript only. TypeScript is not used anywhere in this project.**

## Repository layout

```
opsight/
├── backend/    # Laravel 12 API — Sanctum, Pest, PHPStan
├── frontend/   # Next.js 16 app — React 19, JavaScript, Tailwind v4
└── docs/       # Architecture, product and database documentation
```

## Quick start

Full instructions in [docs/SETUP.md](docs/SETUP.md).

```bash
# Backend
cd backend && composer install && cp .env.example .env
php artisan key:generate

# Three years of realistic history, on top of the accounts. Opt-in: an
# installation must not arrive pre-populated with invented orders.
echo "SEED_DEMO_DATA=true" >> .env

php artisan migrate --seed && php artisan serve --port=8010

# Frontend (second terminal)
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

Then open `http://localhost:3000`. The seeder creates one account per role, all
with the password `password`:

| Role | Email |
| --- | --- |
| Owner | `owner@opsight.test` |
| Manager | `manager@opsight.test` |
| Analyst | `analyst@opsight.test` |
| Staff | `staff@opsight.test` |

Sign in as Staff and then as Owner to see the authorization boundary — the
difference is produced server-side, not hidden in the browser.

A **second business** is seeded beside the first, to make the isolation visible:

| | |
| --- | --- |
| Owner | `owner@alnoor.test` |
| Business | Al Noor Trading, trading in Kuwaiti dinars (three decimal places) |

Signing in as that owner shows twelve orders and its own currency, and a link to
the first business's records answers "not found". You can also create a business
of your own at `/register`, which asks four questions — where you trade, whether
you charge VAT, which days are your weekend — and sets the rest from the answers.

## Licence

Proprietary — see [LICENSE](LICENSE). The repository is public so the work can be
read and evaluated; it is not licensed for use in a product.

## Documentation

Read in this order:

| Document | What it covers |
| --- | --- |
| [docs/product/MVP_SCOPE.md](docs/product/MVP_SCOPE.md) | Product definition, data layers, module-by-module MVP scope |
| [docs/product/ROLES_AND_PERMISSIONS.md](docs/product/ROLES_AND_PERMISSIONS.md) | Roles and the full authorization matrix |
| [docs/product/MARKET_STUDY.md](docs/product/MARKET_STUDY.md) | Arab market fit (Gulf first): currencies, VAT, calendar, integrations, prioritised roadmap — in Arabic |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | System architecture, auth flow, API contract, jobs, caching |
| [docs/database/DATABASE_DESIGN.md](docs/database/DATABASE_DESIGN.md) | Relational schema, constraints, indexes, integrity rules |
| [docs/database/METRICS.md](docs/database/METRICS.md) | Every BI metric: definition, formula, sources, edge cases |
| [docs/architecture/FRONTEND_ARCHITECTURE.md](docs/architecture/FRONTEND_ARCHITECTURE.md) | Next.js structure, data flow, state, components |
| [docs/product/UI_UX_DIRECTION.md](docs/product/UI_UX_DIRECTION.md) | Design system requirements and visual direction |
| [docs/architecture/SECURITY.md](docs/architecture/SECURITY.md) | AuthN/AuthZ, IDOR, mass assignment, rate limiting, auditing |
| [docs/architecture/TESTING_STRATEGY.md](docs/architecture/TESTING_STRATEGY.md) | Test layers and the mandatory business-rule test list |
| [docs/architecture/DECISIONS.md](docs/architecture/DECISIONS.md) | Architecture decision records, including alternatives rejected |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase plan from 00 to 08 |
| [docs/SETUP.md](docs/SETUP.md) | Local setup and troubleshooting |

## Local environment (verified during Phase 00)

| Tool | Version found |
| --- | --- |
| Node.js | v24.13.0 |
| npm | 11.6.2 |
| PHP | 8.2.12 (XAMPP) |
| Composer | 2.9.3 |
| MariaDB | 10.4.32 (XAMPP — service must be started) |
| Laravel Installer | 4.5.1 |
| Git | 2.50.1 |

`pnpm` and `yarn` are not installed; **npm** is the package manager for this project.

## Checks

```bash
cd backend  && composer run check   # Pint + PHPStan + Pest
cd frontend && npm run lint && npm run test && npm run build
```

End-to-end tests need the API running with seeded data:

```bash
cd frontend && npx playwright install chromium && npm run e2e
```
