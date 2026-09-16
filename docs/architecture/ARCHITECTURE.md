# Opsight — System Architecture

Phase 00 document. Nothing here is implemented yet.

---

## 1. Shape of the system

```
                    Browser
                       │
        ┌──────────────┴───────────────┐
        │  Next.js (App Router)        │   app.opsight.test
        │  React · JavaScript · Tailwind│
        └──────────────┬───────────────┘
                       │  HTTPS, JSON, credentials: include
                       │
        ┌──────────────┴───────────────┐
        │  Laravel REST API  /api/v1    │   api.opsight.test
        │  Sanctum · Policies · Services│
        └──────────────┬───────────────┘
                       │
        ┌──────────────┴───────────────┐
        │  MySQL / MariaDB (InnoDB)     │
        └───────────────────────────────┘
                       │
        ┌──────────────┴───────────────┐
        │  Queue (database driver)      │   exports, scheduled reports
        └───────────────────────────────┘
```

Two deployables, one repository. No microservices, no message broker, no separate BFF
process, no GraphQL layer. Every one of those was considered and rejected as unjustified
at this scale (ADR-002, ADR-004).

## 2. Layered backend

Laravel's default controller-and-model layout is not enough once business rules matter.
Opsight uses four layers inside the Laravel application:

```
HTTP layer        Routes → Middleware → FormRequest → Controller → API Resource
Domain layer      Services (business operations), Actions, State machines
Metric layer      Metric classes (L1), Analytics composers (L2), Insight rules (L3)
Persistence       Eloquent models, query scopes, repositories only where needed
```

Responsibilities, strictly:

- **Controller** — authorize, hand the validated input to a service, return a resource.
  No business logic, no arithmetic, no transactions. A controller action should read in
  under fifteen lines.
- **FormRequest** — shape and type validation, plus authorization for the action.
  Format rules only; "is this transition legal" belongs to the domain.
- **Service / Action** — one business operation each (`ConfirmOrder`, `AdjustStock`,
  `RecordRefund`). Owns the transaction boundary. Throws domain exceptions.
- **Metric class** — one metric, one definition, pure over a `Period`. No HTTP awareness.
- **API Resource** — serialization and field-level redaction. The only place that decides
  which keys a given user receives.
- **Model** — relationships, casts, scopes, `$fillable`. No business logic.

The rule that keeps this honest: **any operation that writes more than one table is a
service with an explicit transaction**, never inline controller code.

## 3. Authentication flow

**Chosen approach: Laravel Sanctum in SPA (stateful cookie) mode.** See ADR-002 for the
alternative that was rejected and why.

Frontend and backend are served from sibling subdomains of a shared parent domain so the
session cookie is valid for both:

| Environment | Frontend | API | Cookie domain |
| --- | --- | --- | --- |
| Local | `app.opsight.test` | `api.opsight.test` | `.opsight.test` |
| Production | `app.opsight.com` | `api.opsight.com` | `.opsight.com` |

Local development therefore requires two hosts-file entries. This is a real setup cost
and is the main downside of this choice; it is documented in the Phase 01 setup guide.

### Login sequence

```
1.  GET  /sanctum/csrf-cookie
    → Set-Cookie: XSRF-TOKEN (readable), opsight_session (HttpOnly)

2.  POST /api/v1/auth/login   { email, password }
        X-XSRF-TOKEN: <from cookie>
    → 204, session cookie now authenticated
    → 422 on bad credentials (deliberately identical for unknown email and wrong password)
    → 429 when rate limited

3.  GET  /api/v1/me
    → { data: { id, name, email, role, abilities: [...] } }

4.  Every subsequent request:
        credentials: 'include'
        X-XSRF-TOKEN header on all unsafe methods

5.  POST /api/v1/auth/logout
    → session invalidated, token regenerated, cookies cleared
```

### Cookie and CSRF properties

- Session cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`, domain `.opsight.test`.
- `XSRF-TOKEN` is intentionally readable by JavaScript; it is the double-submit token.
- CSRF is enforced on every `POST`, `PUT`, `PATCH`, `DELETE`.
- CORS: explicit origin allowlist, `supports_credentials: true`. Wildcard origins are
  incompatible with credentialed requests and are never used.
- Session lifetime 8 hours, sliding. `EnsureUserIsActive` middleware rejects a session
  whose user was deactivated mid-session.

### Consequence for Next.js

Because the browser holds the session cookie, **data fetching happens in the browser**.
Server Components render the shell, layout and static chrome; anything requiring the
user's identity is a Client Component using the shared API client. Opsight does not
proxy API calls through Next.js route handlers in the MVP. This is an accepted trade-off
of ADR-002: less server rendering of data, in exchange for one authentication mechanism
instead of two.

## 4. API structure

### Conventions

- Base path `/api/v1`. The version is in the path, and a breaking change means `/v2`.
- Resource-oriented, plural nouns, standard verbs.
- State transitions are **sub-resource actions**, not status patches:
  `POST /orders/{id}/confirm`, not `PATCH /orders/{id} {status:"confirmed"}`.
  A transition runs inventory movements and snapshotting; it is not a field assignment.
- JSON only. `Accept: application/json` is required; the API never returns HTML errors.
- All timestamps are ISO-8601 UTC with an offset. All money is a decimal string.

### Endpoint map (MVP)

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me
PUT    /api/v1/me/password

GET    /api/v1/orders                 list + filter + sort + paginate
POST   /api/v1/orders                 create draft
GET    /api/v1/orders/{id}
PATCH  /api/v1/orders/{id}            draft only
DELETE /api/v1/orders/{id}            draft only
POST   /api/v1/orders/{id}/items
DELETE /api/v1/orders/{id}/items/{itemId}
POST   /api/v1/orders/{id}/confirm
POST   /api/v1/orders/{id}/fulfil
POST   /api/v1/orders/{id}/cancel
POST   /api/v1/orders/{id}/refund

GET    /api/v1/customers              + POST, GET/{id}, PATCH, DELETE
GET    /api/v1/customers/{id}/orders
GET    /api/v1/products               + POST, GET/{id}, PATCH
POST   /api/v1/products/{id}/activate | /deactivate
GET    /api/v1/categories             + POST, PATCH, DELETE

GET    /api/v1/inventory              stock levels
GET    /api/v1/inventory/low-stock
GET    /api/v1/inventory/{productId}/movements
POST   /api/v1/inventory/{productId}/adjust
POST   /api/v1/inventory/{productId}/restock

GET    /api/v1/expenses               + POST, GET/{id}, PATCH, DELETE
GET    /api/v1/expense-categories     + POST, PATCH, DELETE

GET    /api/v1/dashboard              composed summary for a period
GET    /api/v1/analytics/summary      all headline metrics + comparison
GET    /api/v1/analytics/timeseries   metric over time at a grain
GET    /api/v1/analytics/breakdown    metric by product|category|customer
GET    /api/v1/analytics/insights     L3 rule output

GET    /api/v1/users                  + POST, PATCH/{id}
POST   /api/v1/users/{id}/deactivate | /activate
GET    /api/v1/activity

GET    /api/v1/settings               + PUT
GET    /api/v1/health                 unauthenticated
```

Any `GET` collection endpoint accepts `?format=csv` to export, subject to the matching
`*.export` ability.

### Response envelope

Single resource:

```json
{ "data": { "id": 12, "…": "…" } }
```

Collection:

```json
{
  "data": [ ... ],
  "meta": { "current_page": 2, "per_page": 25, "total": 417, "last_page": 17 },
  "links": { "first": "…", "prev": "…", "next": "…", "last": "…" }
}
```

Metric responses always carry their period so a chart can never mislabel itself:

```json
{
  "data": {
    "net_revenue":  { "value": "48210.50", "previous": "43990.00", "change_pct": 9.59 },
    "orders_count": { "value": 312, "previous": 298, "change_pct": 4.7 },
    "gross_margin": { "value": 0.3841, "previous": 0.4012, "change_pct": -4.26 }
  },
  "meta": {
    "from": "2026-08-01T00:00:00+03:00",
    "to":   "2026-08-31T23:59:59+03:00",
    "timezone": "Asia/Bahrain",
    "comparison_basis": "previous_period",
    "comparison_from": "2026-07-01T00:00:00+03:00",
    "comparison_to":   "2026-07-31T23:59:59+03:00",
    "is_partial": false
  }
}
```

### Error contract

Every error is JSON with a stable shape. HTTP status carries the category; `code` carries
the specific cause for anything the client must branch on.

```json
{
  "message": "This order cannot be confirmed because it has no items.",
  "code": "order.empty_cannot_confirm",
  "errors": { "items": ["An order must contain at least one item."] }
}
```

| Status | Meaning | Source |
| --- | --- | --- |
| 400 | Malformed request | Framework |
| 401 | Not authenticated, or session expired | Sanctum |
| 403 | Authenticated but not permitted | Policy |
| 404 | Not found, **or found but not permitted to know it exists** | Model binding / policy |
| 409 | Business-rule conflict (illegal transition, insufficient stock) | Domain exception |
| 422 | Validation failure | FormRequest |
| 429 | Rate limited | Throttle middleware |
| 500 | Unhandled | Logged with a reference id; no internals returned |

Domain exceptions each carry a `code` and map to a status in one exception handler. The
client never parses human-readable messages to decide behaviour.

### Pagination

- Default page-based: `?page=2&per_page=25`. `per_page` is capped at 100.
- Page-based is chosen over cursor for operational tables because the UI needs a total
  count and jump-to-page, and these tables are small enough for `COUNT(*)` to be cheap.
- `GET /activity` uses **cursor pagination** (`?cursor=`). It is append-only, high-volume,
  and only ever read newest-first, where offset pagination degrades and skips rows as new
  entries arrive.
- Exports bypass pagination and stream, with a hard row cap.

### Filtering and sorting

Both are **allowlisted per endpoint**. A field not on the list is rejected with 422 — it
is never silently ignored, because silent ignoring hides bugs and misleads the caller.

```
GET /api/v1/orders
  ?filter[status]=confirmed,fulfilled
  &filter[customer_id]=88
  &filter[placed_at_from]=2026-08-01
  &filter[placed_at_to]=2026-08-31
  &filter[search]=INV-2026
  &sort=-placed_at
  &page=1&per_page=25
```

- `sort` takes a single field, `-` prefixing for descending, from the endpoint's allowlist.
- `filter[search]` maps to an explicit, per-endpoint set of columns. No dynamic column names.
- Date filters are interpreted in the business timezone and converted to UTC before querying.
- Every filter value is bound as a parameter. No user input reaches SQL as a string.

## 5. Frontend data flow

```
Component
   → feature hook            (useOrders, useDashboardSummary)
      → TanStack Query       (cache, dedupe, background refetch, invalidation)
         → service function  (services/orders.js)
            → apiClient      (base URL, credentials, CSRF, error normalisation)
               → Laravel
```

Rules:

- Components never call `fetch` and never know a URL.
- One service module per API resource; it owns the endpoint paths.
- Query keys encode every input that changes the result, period and filters included, so
  changing a filter is a cache miss rather than a stale render.
- A mutation invalidates the affected query keys. Orders confirming invalidates orders,
  inventory and every dashboard/analytics key.
- The API client normalises every error into one shape `{ status, code, message, errors }`
  so components handle one thing. A 401 triggers a single global session-expiry path.

Full detail in [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).

## 6. Validation strategy

Validation happens in three places, deliberately, with different jobs:

| Layer | Validates | Example |
| --- | --- | --- |
| Database | Structural integrity that must never be violated | FK, `UNIQUE(sku)`, `NOT NULL`, `DECIMAL` precision |
| FormRequest | Shape, type, format, presence, range | `quantity` is an integer ≥ 1; `email` is an email |
| Domain service | Business legality | Order can move `confirmed → fulfilled`; stock suffices |

The client performs light inline checks for responsiveness only. **The server is the
source of truth for every rule**, and the client renders the server's 422 body. Validation
rules are not duplicated in JavaScript, which is also why the MVP adds no client schema
library (ADR-012).

## 7. Concurrency and integrity

The two places where two users can collide:

**Stock.** Two orders confirming the same last unit simultaneously. Handled by
`SELECT ... FOR UPDATE` on the `inventory_items` row inside the confirm transaction, so
the second confirm reads the post-decrement value and fails cleanly with 409. A concurrent
test covers this (TESTING_STRATEGY.md).

**Order status.** Two users confirming the same order. Handled by re-reading the order
inside the transaction with a lock and re-checking the transition. The loser gets 409.

General rules:

- Every multi-table write runs inside one transaction. There is no partial confirm.
- Transactions are short; no HTTP calls, queue dispatches or file writes inside them.
  Side effects are dispatched after commit.
- The inventory ledger invariant is the system's integrity canary. A reconciliation
  command reports any drift, and drift is treated as a bug, not as data to be patched.

## 8. Caching opportunities

**The MVP ships with no application cache.** Adding a cache before there is a measured
problem is how correct metrics become stale metrics. The opportunities are documented so
that the eventual addition is deliberate.

| Opportunity | Trigger to implement | Invalidation |
| --- | --- | --- |
| Metric response cache, keyed by metric + period + filters + abilities | Dashboard p95 > 500 ms | On any write to orders, order_items, expenses, inventory |
| **Closed-period** metric cache (a period entirely in the past cannot change except by backdated entry) | Same, and safer than the above | Explicit bust on backdated writes |
| Daily rollup table (`daily_metrics`) | Row counts make live aggregation slow | Nightly rebuild + on-write dirty-day marking (ADR-009) |
| HTTP `ETag` on analytics GETs | Repeat polling observed | Hash of the response body |
| Frontend TanStack Query cache | **Already in the MVP** | Key-based invalidation on mutation |

Non-negotiable when caching is added: **a rollup table is a cache, not a record.** It must
be fully reconstructible from L0 by a single command, and a test must assert that the
rebuilt values equal the live-computed values.

## 9. Background jobs

Queue driver: `database` for the MVP. Redis is not introduced until there is a reason
(ADR-011).

| Job | Phase | Why queued |
| --- | --- | --- |
| `GenerateExport` | Post-MVP | Large CSV/PDF exceeding a synchronous response |
| `RebuildDailyMetrics` | Post-MVP | Batch aggregation over a date range |
| `SendScheduledReport` | Post-MVP | Email delivery, external and slow |
| `RecalculateInventoryCache` | Post-MVP | Reconciliation sweep |

MVP exports are synchronous and row-capped. Queue workers only become a deployment
requirement when the first real job ships, which keeps Phase 01 operationally simple.

**Scheduled reports (Post-MVP).** A `report_schedules` table holds a saved report
definition, a cron expression, recipients and the acting user. The scheduler dispatches
`SendScheduledReport`, which **runs the report as the owning user** so that field-level
redaction applies to the emailed file exactly as it would on screen. A scheduled report
must never be generated with elevated privileges.

## 10. Configuration and environments

- All configuration through `.env`, read via `config()`. No `env()` outside config files —
  it returns null once config is cached.
- `.env.example` committed, `.env` never.
- Business-level settings (company name, currency, timezone, fiscal year start, low-stock
  default) live in the `business_settings` table, not in `.env`. They are business data
  that an Owner edits, not deployment configuration.
- Timezone: the application runs in UTC. Every business date boundary is resolved in
  `business_settings.timezone`. This distinction is a documented source of metric bugs
  and has dedicated tests.

## 11. Observability

MVP scope, kept deliberately small:

- Structured JSON logging with a request id on every log line.
- Laravel's exception handler logs unhandled errors with a reference id that is returned
  to the client and shown in the UI error state.
- Slow-query logging enabled in development.
- `/api/v1/health` reports application, database and queue reachability.
- `activity_logs` serves the audit need; it is not an application log and the two are
  never merged.

Post-MVP: error tracking (Sentry), APM, uptime monitoring.
