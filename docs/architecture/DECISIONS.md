# Opsight — Architecture Decision Records

Every decision where a reasonable engineer could have chosen differently. Each records the
alternatives, the reasoning, the cost accepted, and what would make it worth revisiting.

Status: **Accepted** decisions govern Phase 01 onward and can be overturned by the project
owner. **Open** decisions need an answer before the phase that depends on them.

---

## ADR-001 — Single-business, not multi-tenant

**Status:** Accepted (revisit before any external sale)
**Affects:** Every table, every query, every test

**Decision.** Opsight serves one business per installation. There is no `businesses` table
and no tenant column.

**Alternatives.**

1. *Multi-tenant with `business_id` on every table.* Adds a column, an index and a global
   scope to nineteen tables, plus tenant-scoping middleware, cross-tenant IDOR tests on
   every endpoint, and tenant-aware seeding. That work is real and lands on every future
   feature, not just once.
2. *Database-per-tenant.* Operationally heavy — migration orchestration across N databases,
   connection switching — and wholly unjustified at this scale.
3. *Single-business.* Chosen.

**Reasoning.** The product is an internal operations system for one company's staff.
Multi-tenancy serves a business model Opsight does not have. Building it now would mean
paying for isolation that nothing uses, and every over-engineering rule in the brief points
the same way.

**Cost accepted.** Retrofitting is not free: one migration per table to add `business_id`,
a backfill to a default business, an Eloquent global scope, and a sweep of every raw
aggregate query. Estimated at several days, and it must happen before a second customer,
not after.

**Mitigation.** `business_settings` already isolates per-business configuration
(currency, timezone, fiscal year), so the concept has a home. Queries go through model
scopes rather than scattered raw SQL, which is what makes a global scope a viable retrofit.

**Revisit when:** a second business must share one deployment.

---

## ADR-002 — Sanctum SPA cookie authentication, not JavaScript-held tokens

**Status:** Accepted
**Affects:** Auth flow, deployment topology, frontend rendering model

**Decision.** Laravel Sanctum in stateful SPA mode. The frontend and API are served from
sibling subdomains of a shared parent domain; the session lives in an HttpOnly cookie.

**Alternatives.**

1. *Sanctum API tokens in `localStorage`.* Simple, no domain constraint — and readable by
   any successful XSS. A stolen bearer token is a portable, long-lived credential. Rejected.
2. *Bearer tokens proxied through Next.js route handlers (BFF).* The token lives in a
   Next-set HttpOnly cookie and never reaches browser JavaScript. Genuinely secure, removes
   the shared-domain requirement, and enables server-side data fetching. Rejected for the
   MVP because it means a second server-side hop to build, deploy, test and debug, with
   two auth mechanisms to keep in step.
3. *Sanctum SPA cookie mode.* Chosen.

**Reasoning.** Option 3 gives the same XSS resistance as option 2 with one authentication
mechanism instead of two, and it is the path Laravel documents and supports best.

**Cost accepted.**

- ~~Local development needs hosts-file entries (`app.opsight.test`, `api.opsight.test`).~~
  **Revised in Phase 01: not true.** Cookies ignore port numbers, so `localhost:8000` and
  `localhost:3000` already share a cookie domain. Local setup needs `SESSION_DOMAIN=localhost`
  and `SANCTUM_STATEFUL_DOMAINS=localhost:3000` and nothing else — no hosts file, no
  administrator rights. This removed the main practical objection to this ADR.
- Production still requires both apps under one parent domain, which constrains deployment.
- **Authenticated data is fetched client-side**, so Server Components render the shell but
  not the data (FRONTEND_ARCHITECTURE.md §2). This one held.

**Verified in Phase 01** over real HTTP, end to end: CSRF cookie issued (204), login (200)
setting an HttpOnly session cookie, `/me` authenticated by that cookie alone (200), an unsafe
request without the CSRF header rejected (419), logout (204), and `/me` afterwards (401).
Covered by automated tests at both the feature and browser level.

**Revisit when:** server-side rendering of authenticated data becomes a requirement — a
public shared report link, or a hard SEO/first-paint need. Option 2 is then the move, and
it is additive rather than a rewrite.

---

## ADR-003 — Roles in code, not in the database

**Status:** Accepted
**Affects:** Schema, authorization layer

**Decision.** Four fixed roles in a PHP enum, with a single registry mapping role to
abilities. No `roles`, `permissions` or `role_user` tables.

**Alternatives.**

1. *`spatie/laravel-permission`.* Excellent package, database-backed, runtime-editable.
   Brings three tables, cached permission loading, and an admin UI to build before anyone
   can use it.
2. *Hand-rolled `roles`/`permissions` tables.* All of the above cost, less maturity.
3. *Code registry.* Chosen.

**Reasoning.** The MVP's roles are closed and product-defined. Ability changes are product
decisions that should be code-reviewed and diffable, not database rows that change without
a trace. The registry is also the single source of truth the frontend reads via `/me`.

**Cost accepted.** Changing an ability requires a deploy. For a fixed four-role product,
that is desirable friction rather than a limitation.

**Mitigation.** Code checks `can('expenses.view')`, never `role === 'manager'`
(ROLES_AND_PERMISSIONS.md §5.7). Because every check already goes through abilities,
swapping the registry's backing store for database rows is a single-file change.

**Revisit when:** a customer needs custom roles or a per-user ability override.

---

## ADR-004 — Monorepo with `backend/` and `frontend/`

**Status:** Accepted
**Affects:** Repository layout, CI, deployment

**Decision.** One repository containing both applications and the documentation.

**Alternatives.**

1. *Two repositories.* Clean separation, independent CI and versioning — and an API contract
   change becomes two pull requests in two repositories that must merge in the right order.
   Every cross-cutting change gets that overhead.
2. *Monorepo with a JavaScript workspace tool (Turborepo, Nx).* Useful when packages are
   shared between JavaScript applications. Here there is exactly one JavaScript application
   and one PHP application; the tool would manage nothing.
3. *Plain monorepo, two independent toolchains.* Chosen.

**Reasoning.** The API contract is the highest-churn boundary in the project. Keeping both
sides in one commit means a contract change and its client update are reviewed together and
can never ship half-deployed. For a portfolio project it also means one link tells the whole
story.

**Cost accepted.** CI must path-filter so a frontend change does not run the PHP suite
(TESTING_STRATEGY.md §8). Deployment targets differ per directory. Both are handled once,
in configuration.

**Revisit when:** the two applications acquire genuinely independent release cycles and
separate teams.

---

## ADR-005 — Order-level refunds in the MVP, no refund ledger

**Status:** Accepted
**Affects:** `orders` schema, Net Revenue, Units Sold

**Decision.** `orders.refunded_amount` and `orders.refunded_at`. One refund per order, full
or partial. No `order_refunds` table.

**Alternatives.**

1. *`order_refunds` ledger with line references.* Supports multiple partial refunds,
   attributes refunds to their issue date, and enables unit-level refund accounting. Needs
   a table, a service, UI, and a decision about which period a refund belongs to.
2. *Boolean `is_refunded`.* Cannot express a partial refund at all. Rejected.
3. *Two columns on `orders`.* Chosen.

**Reasoning.** Two columns cover the common case at near-zero cost. A ledger is the correct
end state but is not what makes the MVP valuable.

**Cost accepted, stated plainly.**

- A second refund on the same order cannot be recorded without overwriting the first.
- Refunds reduce the period the order was **placed** in, so a closed period's revenue can
  move when a late refund is recorded (METRICS.md §2.2).
- Units Sold is not reduced by refunds, because there is no line-level refund data
  (METRICS.md §2.4).

**Revisit when:** multiple partial refunds, or refund-date-based reporting, is needed.

---

## ADR-006 — Single stock location

**Status:** Accepted
**Affects:** `inventory_items`, `inventory_movements`

**Decision.** One stock location. `inventory_items` has one row per product, enforced by
`UNIQUE(product_id)`.

**Alternatives.** A `locations` table with per-location stock rows and inter-location
transfer movements. That brings location selection into order confirmation, a transfer
workflow, per-location low-stock thresholds and location-aware analytics — a module, not a
column.

**Reasoning.** Out of MVP scope, and it would touch every inventory surface.

**Mitigation.** The migration is small and known: drop `UNIQUE(product_id)`, add
`location_id`, add `UNIQUE(product_id, location_id)`, add `location_id` to movements,
backfill a default location. Keeping stock in its own table rather than as columns on
`products` is what makes that migration small.

**Revisit when:** a second stock location exists.

---

## ADR-007 — Stock is checked at confirm; no backorders

**Status:** Accepted
**Affects:** Order confirmation, inventory

**Decision.** Confirming an order whose lines exceed available stock fails with 409. Stock
is checked and decremented in one locked transaction at confirm time.

**Alternatives.**

1. *Allow negative stock (backorders).* Real for businesses that sell ahead of supply, but
   it changes the meaning of "stock on hand", needs a fulfilment queue and allocation rules,
   and removes the `CHECK (stock_on_hand >= 0)` safety net.
2. *Reserve stock when a draft is created.* Requires reservation expiry, abandoned-draft
   cleanup, and a reserved-versus-available distinction throughout the UI.
3. *Check and decrement at confirm.* Chosen.

**Reasoning.** The simplest model that is always internally consistent: stock on hand means
physical stock, and it is never negative.

**Cost accepted.** Two users can both build drafts for the last unit; the second fails at
confirm. That is a visible, well-explained failure rather than a silent oversell.

**Mitigation.** `inventory_items.reserved_quantity` exists in the schema, always 0 in the
MVP, so option 2 can be added without a migration.

**Revisit when:** users regularly hit the confirm-time failure, or the business genuinely
sells ahead of stock.

---

## ADR-008 — Flat categories

**Status:** Accepted
**Affects:** `categories`, breakdown analytics

**Decision.** One level. No `parent_id`.

**Alternatives.** Adjacency list (recursive queries for rollups), nested set (fast reads,
painful writes), or materialized path. Each also requires deciding whether a parent's
revenue includes its children's — a question that changes every breakdown, chart and export.

**Reasoning.** Hierarchy multiplies the complexity of aggregation, which is the product's
core. A flat list covers small-business catalogs.

**Revisit when:** a real catalog needs grouping beyond one level. Adjacency list plus
recursive CTEs is the path; MariaDB 10.4 supports them.

---

## ADR-009 — No pre-aggregation in the MVP

**Status:** Accepted
**Affects:** Metric layer, performance

**Decision.** Every metric is computed live from L0. No `daily_metrics` rollup table.

**Alternatives.**

1. *Nightly rollup table.* Fast dashboards, at the cost of staleness, a rebuild job,
   dirty-day invalidation for backdated entries, and a second place where a metric is
   defined — which is the real danger.
2. *Materialized views.* Not available in MySQL or MariaDB.
3. *Live computation with good indexes.* Chosen.

**Reasoning.** At realistic small-business volume — tens of thousands of orders — indexed
aggregation is fast. Pre-aggregating before measuring is optimising a problem that may not
exist, and it risks the correctness the whole product rests on.

**Trigger to implement.** Dashboard p95 above 500 ms on the seeded dataset. That dataset
exists specifically so this is a measurement, not a guess.

---

### MEASURED IN PHASE 04 — verdict: NOT WARRANTED

Dataset: 2,277 orders, 5,520 line items, 6,352 stock movements, 36 months.

The naive measurement said the trigger was met, and it was wrong. Measuring the endpoints
over HTTP gave a dashboard p95 of 774 ms — comfortably past 500 ms, and an apparently clear
mandate to build the rollup table.

Two further measurements showed that conclusion was an artefact:

| What was measured | Result |
| --- | --- |
| Dashboard summary, called directly (no HTTP, no framework boot) | **86 ms**, 16 queries |
| `GET /health` over HTTP — no auth, no database, no work at all | **561 ms** |
| `GET /dashboard` over HTTP | 664 ms |
| **Attributable to the analytics work** | **~103 ms** |

`php artisan serve` is a single-threaded PHP dev server with no opcache. Its fixed
per-request cost on this machine is roughly 560 ms, and that is what the first measurement
was mostly recording. The confirmation: after a change that provably cut the summary from
52 queries to 16, the HTTP figures got *worse* — noise, not signal.

**So the rollup table is not built.** It would introduce staleness, a rebuild job,
dirty-day invalidation for backdated entries, and a second place where a metric is defined,
in order to fix roughly 100 ms that is already well inside budget.

**What the measurement did find** was a real problem the rollup would have masked: the
metric methods derived from each other — `netMargin → netProfit → grossProfit → netRevenue`,
and `grossMargin → netRevenue` again — so `netRevenue` was queried six times per period and
a single summary issued **52 queries**. Consolidating the order-level totals into one
memoised aggregate per period cut that to 16, and the three-year summary from 181 ms to
80 ms. That fix costs no staleness and creates no second definition.

**Caveat, stated plainly.** 561 ms of the measurement is the dev server, so the absolute
HTTP numbers here say nothing about production. What they do establish is the *shape*: the
application's own cost is ~100 ms at this data volume, and the trigger is not met. The
figure should be re-measured on php-fpm with opcache before deployment, and again at ten
times the data.

**Binding constraints if adopted.** A rollup is a **cache, not a record**: fully
reconstructible from L0 by one command; a test asserting rebuilt values equal live-computed
values; backdated writes mark affected days dirty. The metric definition stays in one place.

---

## ADR-010 — Rule-based insights, no anomaly detection

**Status:** Accepted
**Affects:** L3 insights

**Decision.** Insights are explicit threshold rules (METRICS.md §4). No statistics, no
models.

**Alternatives.** Z-score or IQR outlier detection on daily series; seasonal decomposition;
forecasting. All need enough history to be meaningful, all produce false positives on small
retail data, and none can explain themselves in a sentence a manager will act on.

**Reasoning.** Deterministic rules are testable, explainable and trustworthy. "Margin fell
4.2 pp because COGS rose 18%" is more useful than "anomaly detected, confidence 0.83".

**Revisit when:** there are two or more years of dense history and users ask for
detection rather than thresholds.

---

## ADR-011 — Database queue driver, no Redis

**Status:** Accepted
**Affects:** Queues, caching, rate limiting, deployment

**Decision.** `database` for queues and cache in the MVP.

**Reasoning.** The MVP has no queued jobs — exports are synchronous and row-capped. Adding
Redis now means a service to run, configure, secure and monitor for a feature that does not
exist. Laravel's driver abstraction makes the switch a configuration change.

**Revisit when:** the first real background job ships, or the cache becomes hot enough for
database contention to show. Redis then also improves rate limiting across multiple
application instances.

---

## ADR-012 — No client-side schema validation library

**Status:** Accepted
**Affects:** Frontend forms

**Decision.** `react-hook-form` for form state; the server's 422 response is the source of
validation truth. No Zod, Yup or Joi.

**Reasoning.** A client schema duplicates rules that already exist as Laravel FormRequests,
and the two drift. Worse, the client copy is the one that looks authoritative to whoever is
writing the form. One definition, on the server, with the client rendering its errors.

Zod is additionally TypeScript-first; its main advantage — inferred static types — is
unavailable in a JavaScript-only project, so the cost/benefit is worse here than usual.

**Cost accepted.** A round trip for full validation feedback. Mitigated by inline
required/format checks for immediate response, and by the API being local-fast.

**Revisit when:** a form is complex enough that round-trip latency genuinely harms the
experience — a multi-step wizard, for instance.

---

## ADR-013 — Shipping and tax excluded from revenue

**Status:** Accepted
**Affects:** Net Revenue, Gross Margin, every profit metric

**Decision.** Net Revenue excludes both `tax_amount` and `shipping_amount`.

**Reasoning.**

- **Tax** is collected for a tax authority. It is a liability, not earnings. Including it
  inflates revenue and destroys margin comparability. This is not debatable.
- **Shipping** is genuinely debatable. A business charging shipping at cost is recovering an
  expense; a business charging a margin on shipping is earning revenue. Opsight treats it as
  cost recovery, because the alternative inflates revenue for every business that does not
  profit on delivery, and because shipping cost is not modelled — counting the income
  without the cost would overstate profit.

**Cost accepted.** Businesses that profit on shipping will see revenue understated.

**Mitigation.** `shipping_amount` is stored on every order, so the definition can change
without data loss. The change is one line in the Net Revenue metric plus its tests.

**Revisit when:** shipping cost is modelled, or a user reports the understatement.

---

## ADR-014 — Inventory Turnover deferred; Stock Coverage instead

**Status:** Accepted
**Affects:** Inventory metrics

**Decision.** Inventory Turnover is not in the MVP. Stock Coverage in days ships instead
(METRICS.md §2.19).

**Reasoning.** Turnover needs average inventory *value* over the period, which needs
historical stock valuation, which needs a costing method (FIFO or weighted average) the MVP
has not chosen. Approximating with current inventory value produces a number that is wrong
whenever stock levels moved — which is always — and looks perfectly plausible while being
wrong. That is the exact failure mode this project is designed to avoid.

**Mitigation.** `inventory_movements.unit_cost` is recorded on restocks, so the cost basis
for a future valuation is already being captured.

**Revisit when:** a costing method is chosen and daily valuation snapshots exist.

---

## ADR-015 — `DECIMAL` for money, not integer minor units

**Status:** Accepted
**Affects:** Every money column, every aggregate

**Decision.** `DECIMAL(15,4)` for unit amounts, `DECIMAL(15,2)` for totals. Money crosses
the API as a string.

**Alternatives.**

1. *`BIGINT` minor units (cents).* Immune to decimal representation issues and the common
   choice in payment systems. But every aggregate needs conversion on the way out, unit
   costs below one cent need a scale factor anyway, and raw SQL aggregates become harder to
   read and verify by hand — which matters for a system whose correctness is checked against
   hand calculations.
2. *`FLOAT`/`DOUBLE`.* Never. Not a real alternative.
3. *`DECIMAL`.* Chosen.

**Reasoning.** `DECIMAL` is exact in MySQL and MariaDB, `SUM()` and `AVG()` stay exact, and
values are readable in the database during verification. Opsight's primary operation is
aggregation, so keeping aggregation exact and legible in SQL is worth more than integer
arithmetic's safety in application code.

**Cost accepted.** PHP and JavaScript must not cast these to floats. Controlled by: Eloquent
`decimal:` casts, money serialised as strings, `Intl.NumberFormat` for display, no
arithmetic on money in JavaScript, and a unit test for the whole path.

---

## Open decisions

These need an answer from the project owner before the phase that depends on them.

| # | Question | Default if unanswered | Needed by |
| --- | --- | --- | --- |
| ~~**OD-1**~~ | Confirm single-business (ADR-001). | **Resolved Phase 01** — proceeded single-business on the documented default. No `businesses` table, no tenant column. Reversible via ADR-001's migration path, but the cost rises with every table added, so raise it now if it is wrong. | — |
| ~~**OD-2**~~ | Hosts-file requirement vs BFF proxy. | **Resolved Phase 01 — the question dissolved.** There is no hosts-file requirement; see ADR-002's revised cost. Sanctum SPA kept. | — |
| ~~**OD-3**~~ | Currency and timezone for seed data. | **Resolved Phase 01** — seeded `BHD`, `Asia/Bahrain`, fiscal year starting January, in `business_settings`. Changing them is an Owner editing two fields, not a migration. | — |
| **OD-4** | Deployment target. Vercel plus a managed PHP host? A single VPS? It affects queue, cache and cookie-domain configuration, not application code. | Decide in Phase 06 | Phase 06 |
| **OD-5** | Should Staff see any analytics at all, or none? Currently none (ROLES_AND_PERMISSIONS.md §3.1). A revenue-only analytics view is a separate surface with its own design and tests. | Staff get no analytics module | Phase 04 |
| **OD-6** | Order reference format. `ORD-2026-000418` is assumed; some businesses require a specific scheme. | `ORD-{year}-{6-digit sequence}` | Phase 02 |
| **OD-7** | Does the business profit on shipping (ADR-013)? If so, Net Revenue's definition changes. | Shipping excluded from revenue | Phase 04 |
