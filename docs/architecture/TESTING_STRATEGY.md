# Opsight — Testing Strategy

Phase 00 document. No tests are written in this phase.

---

## 1. What testing is for here

Opsight's output is numbers that people make decisions with. A UI bug is embarrassing; a
metric bug is a manager acting on a margin that was never real, and it can go unnoticed for
months because a wrong number looks exactly like a right one.

So the priority is not coverage percentage. It is this:

> **Every business rule stated as "must" in the documentation has a named automated test.**

Coverage targets are deliberately not set as a gate. A percentage threshold rewards testing
getters and punishes nothing. The gate is the checklist in §7.

## 2. Test pyramid, weighted for this product

```
                  E2E (Playwright)             ~6 flows
              ─────────────────────
           Frontend component (Vitest + RTL)   selective
        ────────────────────────────────────
     Backend feature / API (Pest)              the bulk
  ──────────────────────────────────────────
  Backend unit — metrics, money, dates (Pest)  the foundation
```

The weight sits low deliberately. Business rules live in the backend; that is where they
are tested. Frontend tests cover components with real logic, not markup.

## 3. Backend testing

**Framework: Pest**, over plain PHPUnit. It is the Laravel 12 default, its expectation
syntax reads closer to the business rule being asserted, and dataset tests suit a metric
suite with many input/output pairs. PHPUnit assertions remain available where they are
clearer.

**Database.** Tests run against a **real MySQL/MariaDB** test schema, not SQLite. SQLite
differs on `DECIMAL` handling, `CHECK` constraint enforcement, foreign key behaviour and
`SELECT ... FOR UPDATE` — which is to say, on exactly the features this schema relies upon.
Testing on SQLite would give passing tests and a broken production system.

`RefreshDatabase` per test. Seeded fixtures via factories, plus one fixed dataset (§3.2).

### 3.1 Unit tests — pure logic, no database

| Subject | Asserts |
| --- | --- |
| `Period` resolver | Presets produce correct boundaries; fiscal-year QTD/YTD; timezone conversion; DST transitions; half-open ranges |
| Comparison resolver | `previous_period` and `previous_year` boundaries, including month-length and leap-year edges |
| Change calculator | `null` on zero base, null base and sign flip; correct sign; pp vs % distinction |
| Money helper | Half-up rounding; line-level rounding then summation; no float anywhere in the path |
| Ability registry | Every role resolves to the documented ability set; unknown ability denies |
| Insight rules | Each rule fires at its threshold, stays silent below it, and is suppressed on partial periods and low volume |
| Audit redaction | Every key on the redaction list is stripped from a diff |
| CSV formatter | Formula-injection prefixes; correct escaping of quotes, commas and newlines |

### 3.2 Metric tests — the most important suite

A **fixed fixture dataset** with hand-calculated expected values, committed as a seeder and
documented in a companion table so the expected numbers are reviewable by a human rather
than copied from the implementation.

The full list of required metric tests is **METRICS.md §5** and is not duplicated here.
It includes, among others:

- Snapshot integrity — change a product's price and cost, assert a past period's margin is
  byte-identical.
- New-customer correctness — a pre-existing customer who orders in the period is not new.
- Timezone boundaries — 23:30 local on the last day is inside; 00:30 next day is outside.
- Cancellation Rate's denominator including cancelled orders and excluding drafts.
- Refunds reducing the **placed** period, not the refund period.
- Every ratio returning `null`, never `0`, on a zero denominator.

Rule: **a metric test asserts against a hand-calculated literal**, never against a second
implementation of the same formula. Two implementations of the same mistake agree perfectly.

### 3.3 Feature / API tests

Per endpoint:

- Happy path returns the documented status, shape and envelope.
- Validation failures return 422 with the expected field keys.
- Unauthenticated access returns 401.
- The **role matrix**: every role against every endpoint, asserting the expected status.
  Generated from one table so a new endpoint's omission is visible.
- Pagination meta is correct at the first, middle and last page.
- Filters narrow correctly; an unknown filter or sort key returns 422.
- Sorting works in both directions on every allowlisted field.
- Restricted fields are **absent** for cost-blind roles — `assertJsonMissingPath`, not
  `assertNull` (SECURITY.md §2.3).

### 3.4 Business-rule tests

The rules that would be most expensive to get wrong:

**Orders**

- Every legal transition succeeds; every illegal one returns 409 and changes nothing.
- Confirming snapshots `product_name`, `sku`, `unit_price` and `unit_cost` onto each line.
- Confirming with zero items fails.
- Confirming beyond available stock fails, and **no partial stock decrement persists** —
  the transaction rolled back completely.
- Confirming decrements stock by exactly the ordered quantity.
- Cancelling a confirmed order writes a compensating movement returning exactly that stock.
- Cancelling requires a reason.
- A confirmed order cannot be edited by any role.
- `subtotal_amount == SUM(line_total)` and `cogs_amount == SUM(unit_cost × quantity)` after
  confirm.
- A draft order appears in no metric.

**Inventory**

- The ledger invariant: `stock_on_hand == SUM(quantity_delta)` after every operation type.
- A sale cannot drive stock negative.
- An adjustment without a reason is rejected.
- `balance_after` matches the running total at every ledger row.
- Movements are never updated or deleted by any application path.

**Concurrency** — the hardest and most valuable test in the suite:

- Two simultaneous confirms for the last unit: exactly one succeeds, the other returns 409,
  and the ledger invariant holds afterwards. Implemented with two real database connections
  and `SELECT ... FOR UPDATE`, not mocked.
- Two simultaneous confirms of the same order: one succeeds, one gets 409.

**Users**

- The last active Owner cannot be demoted or deactivated.
- A user cannot change their own role or deactivate themselves.
- A deactivated user's live session is rejected on the next request.

**Expenses**

- `incurred_on` drives the period, not `created_at`.
- A backdated expense changes the affected past period's figures.

### 3.5 Security tests

The complete required list is **SECURITY.md §15** and is not duplicated here. It covers the
authorization matrix, field absence, IDOR on nested resources, mass-assignment rejection,
rate limiting, uniform login errors, export field redaction, CSV injection and audit
redaction.

## 4. Frontend testing

**Vitest + React Testing Library.** Vitest over Jest for speed and near-zero configuration
alongside a modern bundler. Testing Library because tests should exercise what a user sees,
not component internals.

**Tested — components with real logic:**

| Subject | Asserts |
| --- | --- |
| `lib/format.js` | Money, percent, pp, compact numbers, dates, relative time; `null` renders `—`; no float arithmetic |
| `lib/periods.js` | Preset ranges, fiscal-year handling, labels |
| `lib/permissions.js` | `can()` for every role's ability list |
| `<Can>` | Renders and withholds correctly; withheld children are not in the DOM |
| `DataTable` | Column rendering, sort interaction, numeric alignment, all four states, keyboard navigation |
| `KpiTile` | `null` shows `—` and never `0`; favourable direction per metric, not per sign; comparison basis text present; partial badge |
| `useUrlFilters` | URL to state to URL round trip; page resets on filter change; invalid parameters rejected |
| `apiClient` | Error normalisation for 4xx, 5xx and network failure; CSRF header attachment; single 401 handling |
| `OrderStatusBadge` / `StatusActions` | Correct actions per status and ability |

**Not tested:** static presentational markup, Tailwind classes, third-party internals.
Snapshot tests are avoided — they fail on every intentional change and are approved without
reading, which trains people to ignore test failures.

**MSW (Mock Service Worker)** intercepts API calls at the network layer, so services and
hooks are exercised for real rather than mocked away. Handlers are generated from the
documented response shapes, and a contract test (§6) keeps them honest.

## 5. End-to-end testing

**Playwright**, against a real backend with a seeded database. Deliberately few, because
E2E tests are slow and flaky in proportion to their number. Each one covers a path where a
failure would be invisible to every lower-level test.

| # | Flow |
| --- | --- |
| 1 | Log in, land on the dashboard, see populated KPIs, log out |
| 2 | Create an order, add items, confirm, verify stock decreased on the inventory page |
| 3 | Cancel a confirmed order, verify stock returned and the order shows cancelled |
| 4 | Filter an order list, share the URL, reload, confirm identical results |
| 5 | Log in as Staff: cost, margin and expense surfaces are absent, and direct URLs are refused |
| 6 | Change a period, verify the dashboard, charts and comparison labels all update coherently |

Flow 5 is the one that justifies E2E existing at all — it is an end-to-end assertion about
a security boundary across both stacks.

Rules: no `waitForTimeout`; wait on state. Each test seeds and cleans its own data.
Run on merge to main and nightly, not on every push, to keep the feedback loop fast.

## 6. Contract consistency

Frontend and backend are tested separately and can drift silently. Two lightweight guards:

1. The backend feature suite asserts the exact response shape of each endpoint, and those
   shapes are the documented source for the MSW handlers.
2. A small contract test runs the documented example payloads against the frontend's
   parsing and formatting layer, so a renamed backend field fails a test rather than
   producing a blank cell in production.

Full schema-driven contract testing (OpenAPI generation and validation) is Post-MVP. It is
the right answer at a larger scale; at this one it would be more machinery than the problem
justifies.

## 7. Definition of done for a feature

A feature is not complete until:

- [ ] Every "must" business rule in its documentation has a named passing test
- [ ] Backend: happy path, validation failure, and the full role matrix are covered
- [ ] Restricted fields are asserted **absent** for roles that may not see them
- [ ] Any new metric has a hand-calculated fixture test, including its null and zero cases
- [ ] Any multi-table write has a rollback test proving no partial state persists
- [ ] Frontend: loading, empty, filtered-empty and error states each render correctly
- [ ] No test asserts against a second implementation of the same formula
- [ ] `composer audit` and `npm audit` clean of high-severity advisories

## 8. CI

Runs on every push and pull request:

```
backend:   composer install → migrate (MySQL service) → pest → phpstan → pint --test → composer audit
frontend:  npm ci → eslint → vitest run → next build → npm audit
e2e:       (main and nightly only) build both → seed → playwright test
```

- Path filtering: a frontend-only change does not run the backend suite. This is the main
  operational cost of the monorepo (ADR-004) and it is handled explicitly.
- Static analysis: **PHPStan / Larastan at level 6** to start, raised deliberately as the
  codebase settles. ESLint with `eslint-config-next`, plus the custom rule forbidding
  physical CSS direction properties (UI_UX_DIRECTION.md §10).
- Formatting: Laravel Pint for PHP, Prettier for JavaScript. Both run in CI as a check, and
  formatting failures block the build so that diffs stay reviewable.
- Migration `down()` methods are executed in CI, so rollbacks are known to work rather than
  assumed to.
