# Opsight — BI Metrics Model

Phase 00 document. Nothing here is implemented yet.

This file is the **single authoritative definition** of every number Opsight displays. If
the API, a chart and an export disagree, this document decides which is wrong.

---

## 1. Foundational rules

### 1.1 Derived, not stored

No metric in this document is persisted as an authoritative value. Each is computed from
L0 source data at query time. A rollup table may later exist as a rebuildable cache
(ADR-009), and if it does, a test must assert the cached value equals the live-computed
value.

The three stored money columns on `orders` — `subtotal_amount`, `total_amount`,
`cogs_amount` — are **frozen transactional facts**, not metrics. See DATABASE_DESIGN.md §3.6.

### 1.2 The period

A period `P` is a pair of instants derived from a user-supplied date range:

1. The user selects dates, e.g. `2026-08-01` to `2026-08-31`.
2. Boundaries are resolved in `business_settings.timezone`:
   `from = 2026-08-01 00:00:00.000` local, `to = 2026-08-31 23:59:59.999` local.
3. Both are converted to UTC for querying.
4. Comparisons are always half-open in SQL: `placed_at >= from_utc AND placed_at < to_utc_exclusive`,
   where `to_utc_exclusive` is the start of the following day. This avoids the classic
   bug where `<= 23:59:59` silently drops rows in the final second.

**Presets:** `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`. `qtd` and `ytd` respect
`business_settings.fiscal_year_start_month`, so a business with a July fiscal start does
not get a calendar-year YTD.

`is_partial` is true when `to` is today or later — the period is still accumulating.

### 1.3 The qualifying order set

Unless a metric says otherwise, **Q(P)** means:

```sql
orders
WHERE status IN ('confirmed', 'fulfilled', 'refunded')
  AND placed_at >= :from_utc
  AND placed_at <  :to_utc_exclusive
```

- `draft` is excluded everywhere. Drafts are working documents, not commitments.
- `cancelled` is excluded from revenue, COGS and AOV. It appears **only** in
  Cancellation Rate, which uses a different denominator (§3.11).
- `refunded` is included, then reduced by `refunded_amount` in net figures. The sale
  genuinely happened; the refund is a separate reduction.

`placed_at` is the business date. `created_at` is never used by a metric — a draft written
in July and confirmed in August is August revenue.

### 1.4 Comparison periods

| Basis | Definition |
| --- | --- |
| `previous_period` (default) | The equal-length period ending immediately before `from`. A 31-day August compares against 1–31 July. |
| `previous_year` | The same calendar dates one year earlier. |
| `none` | No comparison; `previous` and `change_pct` are `null`. |

`previous_period` is the default because it answers "is this better than recently?", which
is the question an operator actually asks. `previous_year` is offered because seasonal
businesses need it and a previous-period comparison misleads them.

### 1.5 Change calculation

```
change_abs = current − previous
change_pct = (current − previous) / |previous|
```

`change_pct` is returned as `null`, never a number, when:

- `previous` is `0` — division by zero.
- `previous` is `null` — no comparison requested or no data.
- `previous` is negative **and** `current` is positive, or vice versa — the percentage is
  arithmetically computable but meaningless as a direction. A loss of −500 becoming a
  profit of +500 is not "200% growth".

A `null` percentage renders as `—` with the absolute change shown. The UI never prints
`0%`, `∞`, `NaN` or a made-up figure.

### 1.6 Rounding and presentation

- Money is aggregated at full `DECIMAL` precision and rounded half-up to
  `business_settings.currency_decimals` at the final step only.
- Ratios are returned as raw decimals (`0.3841`), not pre-formatted percentages. The
  client formats.
- Percentage-point differences between two ratios are labelled **pp**, not %. A margin
  moving 38.4% → 34.2% is "−4.2 pp", not "−4.2%". Mislabelling this is a real reporting
  error and the UI copy is specified accordingly.
- Counts are integers. An average of counts is a decimal.

---

## 2. Metric catalogue

Each entry: definition, formula, source tables, date logic, comparison, edge cases.

---

### 2.1 Gross Revenue

**Definition.** Total value of goods sold before discounts, tax, shipping and refunds.

**Formula.** `SUM(orders.subtotal_amount)` over `Q(P)`

**Sources.** `orders`

**Date logic.** `placed_at` in P.

**Comparison.** Supported, all bases.

**Edge cases.** No qualifying orders → `0.00`, not `null`; zero revenue is a fact.
Excludes tax and shipping by definition (§2.2).

---

### 2.2 Net Revenue

**Definition.** The revenue figure Opsight treats as authoritative. What the business
actually earned from selling goods in the period.

**Formula.**

```
Net Revenue = SUM(orders.subtotal_amount)
            − SUM(orders.discount_amount)
            − SUM(orders.refunded_amount)
   over Q(P)
```

**Sources.** `orders`

**Date logic.** `placed_at` in P.

**What is excluded, and why.**

- **Tax** — collected on behalf of a tax authority. It is a liability, not earnings.
  Including it inflates revenue and destroys margin comparability. With VAT switched on
  (ADR-018), every term in the formula is stored **excluding VAT**, and the VAT part of a
  refund is kept in `refunded_vat_amount`, so the formula needs no change to stay correct.
- **Shipping** — treated as a pass-through cost recovery in the MVP, not revenue
  (ADR-013). Businesses that profit on shipping will want this changed; the ADR records
  the trigger and the one-line change.
- **Cancelled orders** — never entered `Q(P)`.

**Refund timing caveat.** A refund reduces the revenue of the period in which the order
was **placed**, not the period the refund was issued. This keeps an order's economics on
one row and in one period. The consequence is that a closed period's figure can move when
a late refund is recorded. This is a deliberate, documented trade-off; an issue-date
refund model requires the refund ledger of ADR-005 and arrives with it.

**Comparison.** Supported, all bases.

**Edge cases.** Can be negative if refunds in a period exceed sales placed in it. The UI
must render negative revenue correctly rather than clamping at zero.

---

### 2.3 Orders Count

**Definition.** Number of orders committed in the period.

**Formula.** `COUNT(*)` over `Q(P)`

**Sources.** `orders`

**Date logic.** `placed_at` in P.

**Comparison.** Supported.

**Edge cases.** Excludes drafts and cancellations. Refunded orders still count — the order
was placed.

---

### 2.4 Units Sold

**Definition.** Total item quantity sold.

**Formula.** `SUM(order_items.quantity)` for items whose order is in `Q(P)`

**Sources.** `order_items` joined to `orders`

**Comparison.** Supported.

**Edge cases.** Not reduced by refunds — the MVP's order-level `refunded_amount` carries
no line breakdown, so a unit-level reduction cannot be computed honestly. Recorded as a
known limitation resolved by ADR-005.

---

### 2.5 Average Order Value (AOV)

**Definition.** Mean net revenue per order.

**Formula.** `Net Revenue(P) / Orders Count(P)`

**Sources.** `orders`

**Comparison.** Supported.

**Edge cases.**

- `Orders Count = 0` → **`null`**, rendered `—`. Not `0`: "the average order was worth
  nothing" is false, and it would drag a chart to the axis.
- Composed from two L1 metrics, so it automatically inherits their exclusions. It is never
  computed independently from raw rows.

---

### 2.6 Cost of Goods Sold (COGS)

**Definition.** The cost the business paid for the goods sold in the period.

**Formula.** `SUM(orders.cogs_amount)` over `Q(P)`

Equivalently, and asserted equal by test:
`SUM(ROUND(order_items.unit_cost × order_items.quantity, 2))`

**Sources.** `orders`, `order_items`

**Date logic.** `placed_at` in P.

**Critical rule.** COGS reads `order_items.unit_cost` — the **snapshot taken at confirm** —
never `products.cost`. Changing a product's cost today must not move last quarter's COGS.
This has a dedicated regression test.

**Restriction.** Requires `metrics.view_cost`. Omitted from the response for Staff.

**Edge cases.** An item whose `unit_cost` was `0` at confirm contributes zero and inflates
margin. Products with zero cost are flagged in a data-quality insight (§4) rather than
silently distorting the dashboard.

---

### 2.7 Gross Profit

**Definition.** Earnings from selling goods, before operating expenses.

**Formula.** `Net Revenue(P) − COGS(P)`

**Sources.** `orders`, `order_items`

**Comparison.** Supported.

**Restriction.** `metrics.view_cost`.

**Edge cases.** Legitimately negative when goods sell below cost. Never clamped.

---

### 2.8 Gross Margin

**Definition.** Gross profit as a proportion of net revenue.

**Formula.** `Gross Profit(P) / Net Revenue(P)`

**Comparison.** Supported. **Reported as percentage points (pp)**, per §1.6.

**Restriction.** `metrics.view_cost`.

**Edge cases.** `Net Revenue = 0` → `null`. `Net Revenue < 0` → `null`, since the ratio
inverts sign and misleads.

---

### 2.9 Operating Expenses

**Definition.** Business running costs incurred in the period, excluding cost of goods.

**Formula.** `SUM(expenses.amount) WHERE incurred_on BETWEEN :from_date AND :to_date`

**Sources.** `expenses`

**Date logic.** Uses the `DATE` column `incurred_on`, compared against the **local**
period dates with no timezone conversion. An expense belongs to a day, and converting a
date to an instant would shift entries across period boundaries.

**Comparison.** Supported.

**Restriction.** `expenses.view` and `metrics.view_cost`.

**Edge cases.** Backdated entries change a closed period's figure — expected and correct.
A one-off annual payment (insurance, licences) lands entirely in one period and will
distort a monthly comparison; the UI surfaces the category breakdown so it is explainable
rather than mysterious. Expense amortisation is out of scope.

---

### 2.10 Net Profit and Net Margin

**Definition.** Operating profit after all costs, and its proportion of net revenue.

**Formula.**

```
Net Profit = Gross Profit(P) − Operating Expenses(P)
Net Margin = Net Profit(P) / Net Revenue(P)
```

**Comparison.** Supported. Margin in pp.

**Restriction.** `metrics.view_cost`.

**Edge cases.** `Net Revenue = 0` with non-zero expenses gives a null margin and a
negative profit — both are shown, and the null is not filled with a placeholder number.
This is an operating figure, not a statutory one; depreciation, tax and interest are not
modelled and the UI labels it "Operating Profit" to avoid implying otherwise.

---

### 2.11 Cancellation Rate

**Definition.** Share of orders placed in the period that were cancelled.

**Formula.**

```
numerator   = COUNT(orders WHERE status = 'cancelled'
                    AND placed_at in P)
denominator = COUNT(orders WHERE status IN
                    ('confirmed','fulfilled','refunded','cancelled')
                    AND placed_at in P)
rate = numerator / denominator
```

**Sources.** `orders`

**⚠ Denominator differs from `Q(P)`.** This is the one metric that includes cancelled
orders in its base, because a rate needs the full population. Computing it against `Q(P)`
would understate the denominator and overstate the rate. Called out explicitly because it
is the likeliest place for an inconsistency bug.

**Date logic.** By `placed_at`, so a cancellation is attributed to when the order was
placed, not when it was cancelled. A never-confirmed draft has no `placed_at` and is
therefore absent from both sides.

**Comparison.** Supported, in pp.

**Edge cases.** Denominator `0` → `null`.

---

### 2.12 Refund Rate

**Definition.** Share of gross revenue returned to customers.

**Formula.** `SUM(orders.refunded_amount) / Gross Revenue(P)` over `Q(P)`

**Comparison.** Supported, in pp.

**Edge cases.** `Gross Revenue = 0` → `null`. Can exceed 1 if refunds attach to orders
whose revenue was heavily discounted — possible, and not clamped.

---

### 2.13 New Customers

**Definition.** Customers whose **first ever qualifying order** falls in the period.

**Formula.**

```sql
SELECT COUNT(*) FROM (
  SELECT customer_id, MIN(placed_at) AS first_order_at
  FROM orders
  WHERE status IN ('confirmed','fulfilled','refunded')
    AND customer_id IS NOT NULL
  GROUP BY customer_id
) AS firsts
WHERE first_order_at >= :from_utc AND first_order_at < :to_utc_exclusive
```

**Sources.** `orders`

**Critical rule.** The `MIN()` subquery is computed over **all history**, never restricted
to P. Restricting it first would count every customer who ordered in P as new, which is
the single most common implementation error for this metric and has an explicit test.

**Why derived and not stored.** A `customers.first_order_at` column would be wrong the
moment an early order is cancelled or a backdated order is entered. Supported by
`INDEX(orders.customer_id, placed_at)`.

**Edge cases.** Walk-in orders have `customer_id = NULL` and are excluded — they cannot be
attributed to a person. The dashboard states that new-customer figures cover identified
customers only. Soft-deleted customers still count; deleting a customer must not rewrite
history.

---

### 2.14 Returning Customers

**Definition.** Customers who ordered in the period and had ordered before it.

**Formula.** `COUNT(DISTINCT customer_id in Q(P)) − New Customers(P)`

**Edge cases.** Excludes walk-ins, as §2.13. A customer ordering three times in P counts
once.

---

### 2.15 Customer Growth

**Definition.** Change in new-customer acquisition against the comparison period.

**Formula.** `(New Customers(P) − New Customers(P')) / New Customers(P')`

**Edge cases.** `New Customers(P') = 0` → `null`. Growth from a base of zero is not a
percentage.

---

### 2.16 Repeat Purchase Rate

**Definition.** Share of customers active in the period who were not new.

**Formula.** `Returning Customers(P) / (New(P) + Returning(P))`

**Edge cases.** Zero active customers → `null`. Short periods produce volatile values; the
UI does not offer it below a 30-day window.

---

### 2.17 Customer Lifetime Value (LTV)

**Definition.** Total net revenue attributed to one customer across all time.

**Formula.** `SUM(subtotal_amount − discount_amount − refunded_amount)` for all qualifying
orders of that customer, **unbounded by period**.

**Sources.** `orders`

**Restriction.** `customers.view_ltv`.

**Edge cases.** Not period-scoped — showing it inside a period filter would be misleading,
so the UI labels it "all time". Lifetime *profit* (LTV − lifetime COGS) additionally
requires `metrics.view_cost`.

---

### 2.18 Low Stock Count

**Definition.** Number of active products at or below their reorder point.

**Formula.**

```sql
COUNT(*) FROM inventory_items ii
JOIN products p ON p.id = ii.product_id
WHERE p.is_active = 1 AND p.deleted_at IS NULL
  AND ii.stock_on_hand <= COALESCE(
        NULLIF(p.low_stock_threshold, NULL),
        ii.reorder_point,
        (SELECT default_low_stock_threshold FROM business_settings WHERE id = 1))
```

**Date logic.** **None — this is a point-in-time metric.** It reflects now, not the
selected period, and the UI labels it "as of now" so it is never read as a period figure.

**Edge cases.** Threshold `0` means "alert only at zero stock". Inactive products are
excluded. Zero-stock products already at zero are included and sorted first.

---

### 2.19 Stock Coverage (days)

**Definition.** At the recent sales rate, how many days of stock remain.

**Formula.**

```
avg_daily_units = Units Sold(last 30 days) / 30
coverage_days   = stock_on_hand / avg_daily_units
```

**Edge cases.** `avg_daily_units = 0` → `null`, displayed as "no recent sales", **not** as
infinity. Deliberately uses a fixed trailing 30 days regardless of the selected period,
because coverage is about current burn rate; the label says so.

**Why this instead of Inventory Turnover.** See §2.20.

---

### 2.20 Inventory Turnover — **Post-MVP, and why**

**Definition.** `COGS(P) / Average Inventory Value(P)`

Average inventory value requires knowing what stock was worth **at points throughout the
period**. Opsight stores only current stock. There are three honest options:

1. Daily inventory valuation snapshots — a new table, a nightly job, and no history before
   the day it is switched on.
2. Reconstruct historical stock by replaying `inventory_movements` backwards. Possible,
   since `balance_after` is recorded, but valuation also needs a cost basis per unit at
   each point, which requires a costing method (FIFO, weighted average) that the MVP has
   not chosen.
3. Approximate using current inventory value as the average — **rejected**. It produces a
   plausible-looking number that is wrong whenever stock levels moved, which is always.

Option 3 is exactly the kind of fabricated metric this document exists to prevent.
Turnover is therefore deferred until a costing method is chosen (ADR-014), and §2.19's
Stock Coverage ships in the MVP as an honest, computable alternative.

---

## 3. Analytics (L2)

Composed from §2, never recomputed from raw rows.

| View | Shape | Notes |
| --- | --- | --- |
| Summary | Every §2 metric for P with comparison | Powers the dashboard and `/analytics/summary` |
| Time series | One metric per bucket over P | Grain `day`, `week` or `month`; auto-selected by span, overridable |
| Breakdown | One metric grouped by product, category or customer | With each row's share of the total |
| Top-N | Breakdown sorted, limited, plus an "Other" row | Ranking metric is explicit in the request |

**Time series rules.**

- **Buckets with no data are emitted as zero rows, not omitted.** A gap in a date series
  makes a line chart lie about slope.
- Bucket boundaries use the business timezone, like every other period.
- The final bucket is flagged `is_partial` when it contains today, so the client can
  render it dashed rather than as a cliff.
- Grain defaults: ≤ 31 days → daily; ≤ 180 days → weekly; beyond → monthly.

**Breakdown rules.**

- Shares are computed against the period total, so they sum to 1 before Top-N truncation.
- Top-N responses always include the `Other` aggregate, so the visible shares still sum to
  the whole and the chart cannot imply the top 5 are the entire business.

---

## 4. Insights (L3)

Deterministic rules over L2. Each rule is a class with an id, severity, the metrics it
reads, a threshold and a message template. Every insight links to the analytics view
behind it.

MVP rule set:

| Id | Severity | Condition | Message shape |
| --- | --- | --- | --- |
| `margin_decline` | warning | Gross margin down > 3 pp vs comparison | "Gross margin fell {d} pp; COGS rose {c}% while revenue rose {r}%." |
| `revenue_drop` | warning | Net revenue down > 15% | "Net revenue fell {p}% vs the {basis}." |
| `revenue_surge` | positive | Net revenue up > 20% | "Net revenue rose {p}%, driven by {top_category}." |
| `cancellation_spike` | warning | Cancellation rate up > 5 pp and above 10% | "Cancellations reached {r}%, up {d} pp." |
| `low_stock` | action | Any active product at or below reorder point | "{n} products are at or below their reorder point." |
| `stockout_risk` | action | Coverage < 7 days with sales in the last 30 | "{product} has {d} days of stock at the current rate." |
| `customer_concentration` | warning | Top customer > 25% of net revenue | "{customer} accounts for {p}% of revenue this period." |
| `expense_spike` | warning | Any expense category up > 40% and > 5% of revenue | "{category} spending rose {p}%." |
| `zero_cost_products` | data quality | Qualifying items with `unit_cost = 0` | "{n} sold items have no recorded cost; margin is overstated." |
| `dormant_customers` | opportunity | Previously active customers with no order in 90 days | "{n} customers have not ordered in 90 days." |

Rules:

- Every rule is suppressed when its period `is_partial`, unless it is point-in-time
  (`low_stock`, `stockout_risk`). Firing "revenue is down 40%" at 9am on the first of the
  month would be technically true and operationally useless.
- Rules requiring `metrics.view_cost` are not evaluated at all for roles lacking it — not
  evaluated and hidden. Absence of computation is the security boundary.
- Thresholds are configuration, not literals in the rule body, so they are tunable and
  testable.
- Minimum-volume guards: no rule fires on a period with fewer than 10 qualifying orders.
  Percentage swings on tiny samples are noise, and surfacing them destroys trust in the
  whole feed.

---

## 5. Metric test requirements

Binding on Phase 01 onward. Each is a named test in the backend suite.

1. A fixed fixture dataset with **hand-calculated** expected values for every metric in §2.
2. Empty-period behaviour: revenue `0`, AOV `null`, margin `null` — asserted individually.
3. Division-by-zero: every ratio with a zero denominator returns `null`.
4. Negative and sign-flip comparison bases return `null` for `change_pct`.
5. **Snapshot integrity:** compute margin for a past period, change the product's price and
   cost, recompute, assert identical.
6. **New-customer correctness:** a customer whose first order precedes P but who also
   ordered in P is *not* new.
7. Timezone boundary: an order at 23:30 local on the last day of P is inside P; one at
   00:30 the next day is outside.
8. Fiscal-year YTD with a non-January `fiscal_year_start_month`.
9. Cancellation Rate denominator includes cancelled orders and excludes drafts.
10. Refund reduces net revenue in the order's **placed** period, not the refund period.
11. Time series emits zero-value buckets for empty days.
12. Breakdown shares sum to 1 before Top-N truncation, and Top-N plus Other sums to the total.
13. Staff role: COGS, margin and profit keys are **absent** from the response body, not null.
14. Cost-dependent insight rules do not evaluate for cost-blind roles.
15. Two metrics that share a definition (COGS from `orders.cogs_amount` vs from
    `order_items`) agree on the fixture dataset.
