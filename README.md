# Opsight

**Operations & Business Intelligence platform.**

Opsight consolidates a business's operational records — orders, customers, products,
inventory and expenses — and turns them into metrics, comparative analytics and
actionable insights for owners and managers.

> **Status: Phase 01 complete — walking skeleton.**
> Authentication works end to end across both stacks. Operational modules
> (orders, customers, products, inventory, expenses) arrive in Phase 03 and
> business metrics in Phase 04. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
php artisan key:generate && php artisan migrate --seed && php artisan serve --port=8010

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

## Documentation

Read in this order:

| Document | What it covers |
| --- | --- |
| [docs/product/MVP_SCOPE.md](docs/product/MVP_SCOPE.md) | Product definition, data layers, module-by-module MVP scope |
| [docs/product/ROLES_AND_PERMISSIONS.md](docs/product/ROLES_AND_PERMISSIONS.md) | Roles and the full authorization matrix |
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
