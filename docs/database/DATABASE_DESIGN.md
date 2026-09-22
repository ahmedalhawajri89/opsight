# Opsight — Database Design

Phase 00 document. **No migrations exist and none are written in this phase.**

Target engine: MySQL 8.0 or MariaDB 10.4+ (the local environment is MariaDB 10.4.32 via
XAMPP), InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`.

---

## 1. Which tables actually earn a place

The brief listed candidate tables. Each was evaluated rather than accepted.

| Candidate | Decision | Reasoning |
| --- | --- | --- |
| `users` | **Include** | Required for auth and audit attribution. |
| `roles` | **Exclude (MVP)** | Four fixed roles, defined in code. A table adds joins, caching and an admin UI for zero MVP benefit. ADR-003. |
| `permissions` | **Exclude (MVP)** | Same. Abilities live in a code registry that is version-controlled and diffable — better than rows nobody reviews. |
| `businesses` | **Exclude** | Single-business product. A tenant column on nineteen tables is the largest avoidable cost in the schema. ADR-001. |
| `business_settings` | **Include** | Not multi-tenancy — a single row holding currency, timezone, fiscal year start. Timezone in particular is required for correct metrics. |
| `customers` | **Include** | Order dimension, growth and retention metrics. |
| `orders` | **Include** | The revenue-bearing record. |
| `order_items` | **Include** | Line-level detail; the only place COGS can come from. |
| `products` | **Include** | Catalog; price and cost source at sale time. |
| `categories` | **Include** | Flat, single level. ADR-008. |
| `inventory` | **Include, renamed `inventory_items`** | Current derived state, one row per product. The plural name makes its row grain obvious. |
| `inventory_movements` | **Include** | Append-only ledger; the actual source of truth for stock. |
| `expenses` | **Include** | Without it there is no profit metric. |
| `expense_categories` | **Include** | Needed for expense breakdown analytics. A free-text field would make that breakdown unreliable. |
| `activity_logs` | **Include** | Audit requirement. |
| `order_refunds` | **Exclude (MVP)** | MVP supports one full-or-partial refund per order, stored on `orders`. A refund ledger arrives with multiple partial refunds. ADR-005. |
| `daily_metrics` | **Exclude (MVP)** | A cache, not a record. Only when measurement demands it. ADR-009. |
| `suppliers` / `purchase_orders` | **Exclude** | Out of MVP scope. Restocks are recorded as inventory movements with a cost. |

**Result: 12 tables** plus Laravel's framework tables (`sessions`, `jobs`, `failed_jobs`,
`cache`, `password_reset_tokens`, `personal_access_tokens`, `migrations`).

## 2. Cross-cutting conventions

**Keys.** `BIGINT UNSIGNED AUTO_INCREMENT` primary keys. Sequential integers are fine
for an internal single-tenant system where ids are not public identifiers; UUIDs would
cost index locality for no threat-model benefit here. Human-facing identifiers
(`orders.reference`) are separate, generated, and unique.

**Money.**

- Unit-level amounts — `unit_price`, `unit_cost`, `products.price`, `products.cost` —
  are `DECIMAL(15,4)`. Four decimal places because unit costs genuinely land below one
  cent per item.
- Computed and stored totals — line totals, order totals, expense amounts — are
  `DECIMAL(15,3)`, rounded half-up at the **line** level to the currency's own places
  (`business_settings.currency_decimals`: 2 for SAR, 3 for BHD), then summed. Rounding at the
  line is what an invoice does, and matching that avoids a totals-drift bug class.
  `App\Support\Money` is the single source of that precision; `App\Casts\CurrencyAmount`
  applies it on every write and read.
  *Until 2026-09 these columns were `DECIMAL(15,2)` and every calculation used two places,
  so BHD, KWD, OMR and JOD — including the product's own default — lost their third decimal.*
- `DECIMAL` is chosen over integer minor units because `SUM()` and `AVG()` in SQL stay
  exact and readable, which matters for a system whose entire purpose is aggregation.
- **Never cast money to a PHP or JavaScript float.** Eloquent uses `decimal:2` / `decimal:4`
  casts, money crosses the API as a **string**, and the frontend formats strings with
  `Intl.NumberFormat`, never arithmetic on them.
- Single currency for the whole installation, from `business_settings.currency`. No
  per-row currency column, and no FX. Multi-currency would require a rate table and a
  decision about when rates are captured — out of scope, and a column that is always the
  same value teaches nothing.

**Quantities.** `INT` for stock and order quantities — whole units only. Decimal
quantities (weight, length) would change the inventory invariant's arithmetic and are
excluded from the MVP deliberately.

**Dates and times.**

- Event instants are `TIMESTAMP` stored in **UTC**: `placed_at`, `fulfilled_at`,
  `occurred_at`, `created_at`.
- Business dates with no meaningful time are `DATE`: `expenses.incurred_on`. An expense
  happens on a day, not at a moment; forcing a time would invent precision and create a
  timezone bug at every period boundary.
- Every metric resolves its period in `business_settings.timezone`, then converts to UTC
  for the query. Never the reverse.

**Timestamps.** Every table has `created_at` and `updated_at`, except `activity_logs` and
`inventory_movements`, which have `created_at` only — an append-only row has nothing to update.

**Soft deletes.** Applied to `customers`, `products`, `expenses`, `categories`,
`expense_categories`. **Not** applied to `orders`, `order_items`, `inventory_movements` or
`activity_logs`: those are historical facts and are never removed by any path.

**Audit.** Tables carrying `created_by` / `updated_by` FKs to `users`: `orders`,
`expenses`, `inventory_movements`, `products`. Detailed change history lives in
`activity_logs`, not in per-table columns.

**Foreign keys.** Always declared with an explicit `ON DELETE` rule. The default across
the schema is `RESTRICT` — silent cascading deletion of business history is the outcome
being designed against.

---

## 3. Tables

### 3.1 `business_settings`

Singleton. One row, enforced by a fixed primary key of 1.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TINYINT UNSIGNED PK | Always 1; `CHECK (id = 1)` |
| `company_name` | VARCHAR(160) | |
| `currency` | CHAR(3) | ISO 4217, e.g. `BHD` |
| `currency_decimals` | TINYINT UNSIGNED | Display precision; 2 or 3 |
| `timezone` | VARCHAR(64) | IANA name; **drives every metric period boundary** |
| `fiscal_year_start_month` | TINYINT UNSIGNED | 1–12; YTD and QTD depend on it |
| `default_low_stock_threshold` | INT UNSIGNED | Fallback when a product sets none |
| `created_at`, `updated_at` | TIMESTAMP | |

Purpose: business configuration that an Owner edits at runtime, kept out of `.env`.
Loaded once per request and memoised.

### 3.2 `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `name` | VARCHAR(120) | |
| `email` | VARCHAR(190) | **UNIQUE** |
| `email_verified_at` | TIMESTAMP NULL | Reserved; unused in MVP |
| `password` | VARCHAR(255) | bcrypt |
| `role` | ENUM('owner','manager','analyst','staff') | Not null; abilities resolved in code |
| `is_active` | BOOLEAN | Default true; false blocks login and live sessions |
| `last_login_at` | TIMESTAMP NULL | |
| `remember_token` | VARCHAR(100) NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes: `UNIQUE(email)`, `INDEX(role, is_active)`.

Rules: no hard delete. `ENUM` is used over a lookup table because the value set is closed
and code-defined; widening it is a reviewed migration, which is the desired friction.

### 3.3 `categories`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `name` | VARCHAR(120) | **UNIQUE** among non-deleted rows |
| `slug` | VARCHAR(140) | **UNIQUE**; stable API identifier |
| `description` | VARCHAR(500) NULL | |
| `deleted_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Flat. No `parent_id` (ADR-008). A category with products cannot be deleted.

### 3.4 `products`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `sku` | VARCHAR(64) | **UNIQUE**; immutable after creation |
| `name` | VARCHAR(180) | |
| `description` | TEXT NULL | |
| `category_id` | BIGINT UNSIGNED NULL | FK → `categories.id` `ON DELETE SET NULL` |
| `price` | DECIMAL(15,4) | Current selling price; `CHECK (price >= 0)` |
| `cost` | DECIMAL(15,4) | Current unit cost; **restricted field** |
| `unit` | VARCHAR(24) | `piece`, `kg`, `box` — labelling only |
| `low_stock_threshold` | INT UNSIGNED NULL | Null falls back to settings |
| `is_active` | BOOLEAN | Default true |
| `created_by` | BIGINT UNSIGNED NULL | FK → `users.id` `ON DELETE SET NULL` |
| `deleted_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes: `UNIQUE(sku)`, `INDEX(category_id, is_active)`, `INDEX(is_active)`,
`INDEX(name)` for search.

Rules: `price` and `cost` are the *current* values only. They are never read by a metric —
metrics read the snapshot on `order_items`. This is the single most important separation
in the schema.

### 3.5 `customers`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `name` | VARCHAR(180) | |
| `email` | VARCHAR(190) NULL | **UNIQUE**; NULLs do not collide in MySQL/MariaDB, which is exactly the behaviour wanted for walk-in customers |
| `phone` | VARCHAR(40) NULL | |
| `company` | VARCHAR(180) NULL | |
| `address_line` | VARCHAR(255) NULL | |
| `city` | VARCHAR(120) NULL | |
| `country` | CHAR(2) NULL | ISO 3166-1 alpha-2; enables geographic breakdown |
| `notes` | TEXT NULL | |
| `is_active` | BOOLEAN | Default true |
| `created_by` | BIGINT UNSIGNED NULL | FK → `users.id` `ON DELETE SET NULL` |
| `deleted_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes: `UNIQUE(email)`, `INDEX(name)`, `INDEX(created_at)`, `INDEX(country)`.

**No `total_orders`, `total_spent` or `first_order_at` columns.** Every one of those is a
metric derived from `orders`, and storing them creates a second source of truth that goes
wrong the first time an order is cancelled. If aggregation becomes slow, the answer is
ADR-009's rebuildable rollup, not a denormalised column nobody recomputes.

### 3.6 `orders`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `reference` | VARCHAR(32) | **UNIQUE**, e.g. `ORD-2026-000418`; the human identifier |
| `customer_id` | BIGINT UNSIGNED NULL | FK → `customers.id` `ON DELETE RESTRICT`; null for walk-in |
| `status` | ENUM('draft','confirmed','fulfilled','cancelled','refunded') | Default `draft` |
| `placed_at` | TIMESTAMP NULL | Set when confirmed. **The business date for every order metric** |
| `fulfilled_at` | TIMESTAMP NULL | |
| `cancelled_at` | TIMESTAMP NULL | |
| `cancellation_reason` | VARCHAR(255) NULL | Required when cancelling |
| `refunded_at` | TIMESTAMP NULL | |
| `refunded_amount` | DECIMAL(15,3) | Default 0; `CHECK (refunded_amount >= 0)` |
| `subtotal_amount` | DECIMAL(15,3) | Sum of line totals |
| `discount_amount` | DECIMAL(15,3) | Default 0, order level |
| `tax_amount` | DECIMAL(15,3) | Default 0; **not revenue** |
| `shipping_amount` | DECIMAL(15,3) | Default 0; **not revenue** (ADR-013) |
| `total_amount` | DECIMAL(15,3) | subtotal − discount + tax + shipping; what the customer pays |
| `cogs_amount` | DECIMAL(15,3) | Sum of line cost snapshots, frozen at confirm; **restricted field** |
| `prices_include_vat` | BOOLEAN | Snapshot at confirm: whether the shelf prices included VAT (ADR-018) |
| `refunded_vat_amount` | DECIMAL(15,3) | The VAT part of a refund; never subtracted from revenue |
| `notes` | TEXT NULL | |
| `created_by` | BIGINT UNSIGNED NULL | FK → `users.id` `ON DELETE SET NULL` |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes:

- `UNIQUE(reference)`
- `INDEX(status, placed_at)` — the workhorse; nearly every metric filters status then ranges on date
- `INDEX(placed_at)` — time series
- `INDEX(customer_id, placed_at)` — customer history and first-order detection
- `INDEX(created_by)`
- `INDEX(status, created_at)` — draft lists, which have no `placed_at`

**On the stored totals.** `subtotal_amount`, `total_amount` and `cogs_amount` are computed
values that *are* stored, which appears to contradict "do not store derived values". The
distinction is deliberate: these are **frozen transactional facts**, not metrics. Once an
order is confirmed they can never legitimately change, they are what the customer was
charged, and recomputing them on every read would mean re-deriving the same immutable
number millions of times. Metrics like Net Revenue and Gross Margin remain uncomputed and
unstored. The safeguard: a test asserts that for every confirmed order,
`subtotal_amount == SUM(order_items.line_total)` and `cogs_amount == SUM(unit_cost × quantity)`.

**Status semantics.**

| Status | In metrics? | Stock effect |
| --- | --- | --- |
| `draft` | No — invisible to every metric | None |
| `confirmed` | Yes | Decremented |
| `fulfilled` | Yes | Already decremented |
| `cancelled` | Counted only in Cancellation Rate | Returned |
| `refunded` | Yes, reduced by `refunded_amount` | Returned |

### 3.7 `order_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `order_id` | BIGINT UNSIGNED | FK → `orders.id` `ON DELETE CASCADE` |
| `product_id` | BIGINT UNSIGNED NULL | FK → `products.id` `ON DELETE RESTRICT`; navigation only |
| `product_name` | VARCHAR(180) | **Snapshot** |
| `product_sku` | VARCHAR(64) | **Snapshot** |
| `quantity` | INT UNSIGNED | `CHECK (quantity >= 1)` |
| `unit_price` | DECIMAL(15,4) | **Snapshot** at confirm |
| `unit_cost` | DECIMAL(15,4) | **Snapshot** at confirm; **restricted field** |
| `line_discount` | DECIMAL(15,3) | Default 0 |
| `line_total` | DECIMAL(15,3) | `ROUND(unit_price × quantity, currency_decimals) − line_discount`, **excluding VAT** when VAT is on (ADR-018) |
| `vat_rate` | DECIMAL(5,2) | **Snapshot** at confirm, a percentage; 0 when VAT was off |
| `vat_taxable_amount` | DECIMAL(15,3) | Net amount VAT was charged on, after its share of the order discount |
| `vat_amount` | DECIMAL(15,3) | **Snapshot** VAT for the line |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes: `INDEX(order_id)`, `INDEX(product_id)`, `INDEX(product_id, order_id)` for
product-level analytics.

`ON DELETE CASCADE` from `orders` is safe **only** because orders are never deleted once
they leave `draft`. Deleting a draft correctly removes its lines.

This table is where historical truth is preserved. The four snapshot columns are the
reason a price change today cannot rewrite last quarter's margin.

### 3.8 `inventory_items`

Current derived stock state. One row per product.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `product_id` | BIGINT UNSIGNED | **UNIQUE**, FK → `products.id` `ON DELETE CASCADE` |
| `stock_on_hand` | INT | **Derived cache**; `CHECK (stock_on_hand >= 0)` |
| `reserved_quantity` | INT | Default 0; reserved for future draft holds, always 0 in MVP |
| `reorder_point` | INT UNSIGNED | Low-stock trigger |
| `last_movement_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes: `UNIQUE(product_id)`, `INDEX(stock_on_hand)`.

Kept separate from `products` for three reasons: it isolates derived state from catalog
source data, it gives the confirm transaction a narrow row to lock without contending on
the product record, and dropping the unique constraint plus adding `location_id` is the
whole multi-warehouse migration (ADR-006).

`UNIQUE(product_id)` is what makes the row-lock strategy correct — there is exactly one
row to lock per product.

### 3.9 `inventory_movements`

Append-only ledger. **The source of truth for stock.**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `product_id` | BIGINT UNSIGNED | FK → `products.id` `ON DELETE RESTRICT` |
| `quantity_delta` | INT | Signed; negative for sales, positive for restock. `CHECK (quantity_delta <> 0)` |
| `balance_after` | INT | Stock after this movement; makes the ledger auditable without a running sum |
| `reason` | ENUM('sale','sale_cancelled','sale_refunded','restock','adjustment','damage','loss','initial') | |
| `reference_type` | VARCHAR(48) NULL | Polymorphic: `order`, `manual` |
| `reference_id` | BIGINT UNSIGNED NULL | |
| `unit_cost` | DECIMAL(15,4) NULL | Cost on restock; the input to future inventory valuation |
| `note` | VARCHAR(255) NULL | **Required** when `reason = 'adjustment'` |
| `created_by` | BIGINT UNSIGNED NULL | FK → `users.id` `ON DELETE SET NULL` |
| `occurred_at` | TIMESTAMP | Business instant |
| `created_at` | TIMESTAMP | Row insertion instant |

Indexes: `INDEX(product_id, occurred_at)`, `INDEX(reference_type, reference_id)`,
`INDEX(reason, occurred_at)`, `INDEX(occurred_at)`.

**No `updated_at`, no `deleted_at`.** A ledger entry is never edited or removed; a mistake
is corrected by a compensating entry, so both the error and its correction stay on record.

Invariant, enforced by test and by a reconciliation command:

```sql
SELECT product_id, SUM(quantity_delta) FROM inventory_movements GROUP BY product_id
-- must equal --
SELECT product_id, stock_on_hand FROM inventory_items
```

### 3.10 `expense_categories`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `name` | VARCHAR(120) | **UNIQUE** |
| `slug` | VARCHAR(140) | **UNIQUE** |
| `is_active` | BOOLEAN | Default true |
| `deleted_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Seeded with: Rent, Payroll, Utilities, Marketing, Logistics, Software, Maintenance, Other.

### 3.11 `expenses`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `expense_category_id` | BIGINT UNSIGNED | FK → `expense_categories.id` `ON DELETE RESTRICT` |
| `description` | VARCHAR(255) | |
| `amount` | DECIMAL(15,3) | `CHECK (amount > 0)` |
| `incurred_on` | DATE | **Business date**; may be backdated |
| `vendor` | VARCHAR(180) NULL | |
| `reference` | VARCHAR(80) NULL | Invoice or receipt number |
| `notes` | TEXT NULL | |
| `created_by` | BIGINT UNSIGNED NULL | FK → `users.id` `ON DELETE SET NULL` |
| `deleted_at` | TIMESTAMP NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

Indexes: `INDEX(incurred_on)`, `INDEX(expense_category_id, incurred_on)`,
`INDEX(created_by)`.

Rule: expenses are **operating** expenses. Stock purchase cost enters profit through COGS
via `order_items.unit_cost`. Recording a restock as an expense double-counts it, so the
restock flow never creates an expense row and the UI says so.

### 3.12 `activity_logs`

Append-only audit trail.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | |
| `user_id` | BIGINT UNSIGNED NULL | FK → `users.id` `ON DELETE SET NULL`; null for system actions |
| `action` | VARCHAR(64) | `order.confirmed`, `product.updated`, `auth.login_failed`, `export.generated` |
| `subject_type` | VARCHAR(64) NULL | |
| `subject_id` | BIGINT UNSIGNED NULL | |
| `changes` | JSON NULL | `{ "before": {...}, "after": {...} }`, **changed attributes only** |
| `context` | JSON NULL | Filters used on an export, transition reason, etc. |
| `ip_address` | VARBINARY(16) NULL | Packed; holds IPv4 and IPv6 |
| `user_agent` | VARCHAR(255) NULL | |
| `created_at` | TIMESTAMP | |

Indexes: `INDEX(subject_type, subject_id, created_at)`, `INDEX(user_id, created_at)`,
`INDEX(action, created_at)`, `INDEX(created_at)`.

Rules: the application exposes no update or delete path. `changes` never contains
`password`, `remember_token`, or any Sanctum token value — the redaction key list is
central and unit-tested. This is the highest-growth table in the system, which is why its
API uses cursor pagination and why partitioning by month is noted as a Post-MVP option.

---

## 4. Relationships

```
users ──< orders.created_by
users ──< expenses.created_by
users ──< inventory_movements.created_by
users ──< products.created_by
users ──< activity_logs.user_id

categories ──< products
products ──1 inventory_items
products ──< inventory_movements
products ──< order_items          (RESTRICT: a sold product cannot be hard-deleted)

customers ──< orders              (RESTRICT)
orders ──< order_items            (CASCADE — safe only because non-draft orders are never deleted)
orders ──< inventory_movements    (polymorphic reference_type/reference_id)

expense_categories ──< expenses   (RESTRICT)
```

## 5. Integrity rules the schema enforces

| Rule | Mechanism |
| --- | --- |
| No duplicate SKU | `UNIQUE(products.sku)` |
| No duplicate customer email, blanks allowed | `UNIQUE(customers.email)` with NULLs permitted |
| No duplicate order reference | `UNIQUE(orders.reference)` |
| One stock row per product | `UNIQUE(inventory_items.product_id)` |
| Stock never negative | `CHECK (stock_on_hand >= 0)` plus an application check inside the locked transaction |
| No zero-quantity line | `CHECK (quantity >= 1)` |
| No zero-delta movement | `CHECK (quantity_delta <> 0)` |
| Negative money impossible | `CHECK (amount > 0)`, `CHECK (price >= 0)` |
| Sold products cannot vanish | FK `RESTRICT` on `order_items.product_id` |
| Customers with orders cannot vanish | FK `RESTRICT` on `orders.customer_id` |
| Settings stay singleton | `CHECK (id = 1)` |

MariaDB 10.4 enforces `CHECK` constraints, so they are real rather than documentation.
Application-level validation still exists for every one of these — the constraint is the
last line of defence, not the error message the user sees.

## 6. Aggregation performance

Every headline metric is a filtered aggregate over `orders` and `order_items`. The access
pattern is always the same: **filter on status, range on `placed_at`, aggregate.**

- `INDEX(status, placed_at)` is the key index in the schema. Column order matters:
  status is an equality (or small `IN`) predicate and must come first for the range on
  `placed_at` to be usable.
- Product breakdowns join `order_items` to `orders`; `INDEX(order_items.product_id, order_id)`
  keeps that join index-driven.
- New-customer detection needs each customer's earliest qualifying order — covered by
  `INDEX(orders.customer_id, placed_at)`.
- Expense aggregation is a pure range on `INDEX(expenses.incurred_on)`.

Targets: dashboard summary under 300 ms at 100k orders and 400k line items. A seeder
generating three years of realistic data is a Phase 01 deliverable **specifically so
these numbers can be measured rather than assumed**. If they are missed, ADR-009's
rollup table is the planned response — not denormalised counters on `customers` and
`products`.

## 7. Seeding

Development seed data must be realistic enough to make metric bugs visible:

- 3 years of orders with weekday/weekend and seasonal variation, not a uniform sprinkle.
- Every order status represented, including cancellations and refunds.
- Products whose price and cost changed mid-history — this is the dataset that proves
  snapshot correctness.
- Customers with one order, with many, and with none.
- Expenses across all categories, including backdated entries.
- One user per role, with fixed credentials, for manual authorization testing.
- A known small fixture dataset with **hand-calculated expected metric values**, used by
  the metric test suite.

## 8. Migration and rollback discipline

- One concern per migration, named for what it does.
- Every migration has a working `down()`. It is run in CI, not assumed.
- Adding an index to a large table uses an online-capable path; MariaDB 10.4 supports
  `ALGORITHM=INPLACE` for secondary index creation.
- Data backfills are separate migrations from schema changes, so a schema rollback does
  not discard data.
- No destructive migration (dropping a column holding business data) ships without an
  explicit, reviewed decision recorded in DECISIONS.md.
