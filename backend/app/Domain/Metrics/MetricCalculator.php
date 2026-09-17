<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Domain\Orders\OrderStatus;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Every metric in the system, defined exactly once.
 *
 * This class is the L1 layer. It reads L0 and nothing else; the analytics layer
 * composes from here and never recomputes with its own arithmetic. If the API,
 * a chart and an export ever disagree, docs/database/METRICS.md decides which
 * is wrong — and this file is the only implementation of it.
 *
 * NOTHING HERE IS STORED. Every figure is derived at query time.
 *
 * Three invariants hold throughout:
 *
 *   1. Money is summed in SQL at full DECIMAL precision and returned as a
 *      string. It never becomes a PHP float (ADR-015).
 *   2. Qualifying orders are confirmed, fulfilled or refunded, ranged on
 *      placed_at. Drafts are invisible; cancelled orders appear only in the
 *      Cancellation Rate, which needs a different denominator.
 *   3. COGS reads order_items.unit_cost — the snapshot taken at confirm — never
 *      products.cost. This is what makes a price change today unable to move
 *      last quarter's margin.
 */
final class MetricCalculator
{
    /** @var array<string, object> Per-period aggregates, memoised for the request. */
    private array $aggregates = [];

    /**
     * Discard the memoised aggregates.
     *
     * The calculator reads a CONSISTENT SNAPSHOT for the life of a request,
     * which is correct for a reporting request and wrong for anything that
     * writes an order and then reports on it in the same process. No endpoint
     * does that, but tests do — and an escape hatch that is stated is better
     * than an assumption that is merely true today.
     */
    public function flush(): void
    {
        $this->aggregates = [];
    }

    /* ---------------------------------------------------------------------- */
    /* Revenue */
    /* ---------------------------------------------------------------------- */

    /** Total value of goods sold, before discounts, tax, shipping and refunds. */
    public function grossRevenue(Period $period): string
    {
        return $this->aggregate($period)->gross;
    }

    /**
     * The revenue figure Opsight treats as authoritative.
     *
     * Excludes tax (collected for a tax authority — a liability, not earnings)
     * and shipping (treated as cost recovery, ADR-013). Reduced by refunds,
     * which attach to the period the order was PLACED in rather than the period
     * the refund was issued, so an order's economics stay on one row.
     */
    public function netRevenue(Period $period): string
    {
        $totals = $this->aggregate($period);

        return bcsub(bcsub($totals->gross, $totals->discounts, 2), $totals->refunds, 2);
    }

    public function ordersCount(Period $period): int
    {
        return $this->aggregate($period)->orders;
    }

    /**
     * Total item quantity sold.
     *
     * NOT reduced by refunds: the MVP's order-level refunded_amount carries no
     * line breakdown, so a unit-level reduction cannot be computed honestly.
     * A known limitation, resolved by ADR-005's refund ledger.
     */
    public function unitsSold(Period $period): int
    {
        [$from, $to] = $period->utcBounds();

        return (int) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to)
            ->sum('order_items.quantity');
    }

    /**
     * Mean net revenue per order.
     *
     * Returns NULL when there are no orders, not 0. "The average order was
     * worth nothing" is false, and a zero would drag a chart to the axis.
     */
    public function averageOrderValue(Period $period): ?string
    {
        $count = $this->ordersCount($period);

        if ($count === 0) {
            return null;
        }

        return bcdiv($this->netRevenue($period), (string) $count, 2);
    }

    /* ---------------------------------------------------------------------- */
    /* Cost and profit — every method here requires metrics.view_cost */
    /* ---------------------------------------------------------------------- */

    /**
     * What the business paid for the goods sold in the period.
     *
     * Reads the frozen cogs_amount, which ConfirmOrder computed from the line
     * cost snapshots. A test asserts it equals the sum over order_items.
     */
    public function cogs(Period $period): string
    {
        return $this->aggregate($period)->cogs;
    }

    public function grossProfit(Period $period): string
    {
        return bcsub($this->netRevenue($period), $this->cogs($period), 2);
    }

    /**
     * Gross profit over net revenue.
     *
     * Null when net revenue is zero (division by zero) OR negative — a negative
     * base inverts the ratio's sign and makes it misleading rather than merely
     * unusual.
     */
    public function grossMargin(Period $period): ?float
    {
        $revenue = $this->netRevenue($period);

        if (bccomp($revenue, '0', 2) <= 0) {
            return null;
        }

        // Scale 10, not 6: bcdiv TRUNCATES rather than rounds, so dividing at
        // the display scale silently loses the last digit — 300/540 became
        // 0.555555 instead of 0.555556. Dividing wide and letting the caller
        // round is the fix.
        return (float) bcdiv($this->grossProfit($period), $revenue, 10);
    }

    /**
     * Business running costs, excluding cost of goods.
     *
     * Ranges on incurred_on, a DATE, compared against the LOCAL period dates
     * with no timezone conversion. An expense belongs to a day; converting it to
     * an instant would shift entries across period boundaries (METRICS.md §2.9).
     */
    public function operatingExpenses(Period $period): string
    {
        $total = DB::table('expenses')
            ->whereNull('deleted_at')
            ->whereBetween('incurred_on', [$period->from, $period->to])
            ->selectRaw('COALESCE(SUM(amount), 0) AS total')
            ->value('total');

        return (string) ($total ?? '0.00');
    }

    public function netProfit(Period $period): string
    {
        return bcsub($this->grossProfit($period), $this->operatingExpenses($period), 2);
    }

    public function netMargin(Period $period): ?float
    {
        $revenue = $this->netRevenue($period);

        if (bccomp($revenue, '0', 2) <= 0) {
            return null;
        }

        return (float) bcdiv($this->netProfit($period), $revenue, 10);
    }

    /* ---------------------------------------------------------------------- */
    /* Rates */
    /* ---------------------------------------------------------------------- */

    /**
     * Share of orders placed in the period that were cancelled.
     *
     * ⚠ THE DENOMINATOR DIFFERS FROM EVERY OTHER METRIC. It includes cancelled
     * orders, because a rate needs its full population. Computing it against the
     * qualifying set would understate the denominator and overstate the rate —
     * the likeliest place in the whole system for an inconsistency bug, which is
     * why it is called out here and has its own test (METRICS.md §2.11).
     */
    public function cancellationRate(Period $period): ?float
    {
        [$from, $to] = $period->utcBounds();

        $row = DB::table('orders')
            ->whereIn('status', OrderStatus::placed())
            ->where('placed_at', '>=', $from)
            ->where('placed_at', '<', $to)
            ->selectRaw("COUNT(*) AS total, SUM(status = 'cancelled') AS cancelled")
            ->first();

        $total = (int) ($row->total ?? 0);

        if ($total === 0) {
            return null;
        }

        return (int) ($row->cancelled ?? 0) / $total;
    }

    public function refundRate(Period $period): ?float
    {
        $gross = $this->grossRevenue($period);

        if (bccomp($gross, '0', 2) === 0) {
            return null;
        }

        return (float) bcdiv($this->aggregate($period)->refunds, $gross, 10);
    }

    /* ---------------------------------------------------------------------- */
    /* Customers */
    /* ---------------------------------------------------------------------- */

    /**
     * Customers whose FIRST EVER qualifying order falls in the period.
     *
     * The MIN() subquery runs over ALL HISTORY, never restricted to the period.
     * Restricting it first would count every customer who ordered in the period
     * as new — the single most common implementation error for this metric, and
     * one that inflates growth figures without ever looking wrong.
     *
     * Walk-in orders have no customer_id and are excluded: they cannot be
     * attributed to a person.
     */
    public function newCustomers(Period $period): int
    {
        [$from, $to] = $period->utcBounds();

        $firsts = DB::table('orders')
            ->selectRaw('customer_id, MIN(placed_at) AS first_order_at')
            ->whereIn('status', OrderStatus::qualifying())
            ->whereNotNull('customer_id')
            ->groupBy('customer_id');

        return (int) DB::query()
            ->fromSub($firsts, 'firsts')
            ->where('first_order_at', '>=', $from)
            ->where('first_order_at', '<', $to)
            ->count();
    }

    /** Customers who ordered in the period and had ordered before it. */
    public function returningCustomers(Period $period): int
    {
        return max(0, $this->activeCustomers($period) - $this->newCustomers($period));
    }

    public function activeCustomers(Period $period): int
    {
        [$from, $to] = $period->utcBounds();

        return (int) DB::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->whereNotNull('customer_id')
            ->where('placed_at', '>=', $from)
            ->where('placed_at', '<', $to)
            ->distinct()
            ->count('customer_id');
    }

    /** Share of active customers who were not new. Null below any activity. */
    public function repeatPurchaseRate(Period $period): ?float
    {
        $active = $this->activeCustomers($period);

        if ($active === 0) {
            return null;
        }

        return $this->returningCustomers($period) / $active;
    }

    /**
     * Operating expenses split by category, for the period.
     *
     * Lives here rather than in the insight rule that reads it, because it is
     * the same figure as `operatingExpenses` with a GROUP BY — and a rule that
     * writes its own expense query is a second definition of "operating
     * expense" that will disagree with the first the day someone changes what
     * counts (ARCHITECTURE.md §2).
     *
     * Ranges on `incurred_on` against the LOCAL dates, exactly as
     * `operatingExpenses` does, for the same reason.
     *
     * @return array<string, string> category name => amount
     */
    public function operatingExpensesByCategory(Period $period): array
    {
        $rows = DB::table('expenses')
            ->join('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->whereNull('expenses.deleted_at')
            ->whereBetween('expenses.incurred_on', [$period->from, $period->to])
            ->groupBy('expense_categories.id', 'expense_categories.name')
            ->selectRaw('expense_categories.name AS name, COALESCE(SUM(expenses.amount), 0) AS total')
            ->get();

        $totals = [];

        foreach ($rows as $row) {
            $totals[(string) $row->name] = (string) $row->total;
        }

        return $totals;
    }

    /**
     * Sold line items carrying no recorded cost.
     *
     * A DATA QUALITY figure, not a business one. A line with `unit_cost = 0`
     * contributes its full revenue to gross profit and nothing to COGS, so
     * every margin covering it is overstated — silently, and in the
     * favourable direction, which is the worst way for a reporting error to
     * fail. Counting them is how the dashboard can admit it.
     *
     * Note this counts the SNAPSHOT on the line, not the product's cost today.
     * A product priced correctly now can still have been sold at zero cost
     * last March, and it is last March's margin that is wrong.
     */
    public function zeroCostItemCount(Period $period): int
    {
        [$from, $to] = $period->utcBounds();

        return (int) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to)
            ->where('order_items.unit_cost', '<=', 0)
            ->count();
    }

    /**
     * Customers who once ordered and have not for `$days`.
     *
     * A POINT-IN-TIME figure measured backwards from now, not from the
     * selected period: "dormant" means dormant today. Ranging it on the
     * selected period would make a customer's dormancy change every time the
     * reader moved the date picker, which is not what the word means.
     *
     * Only customers with at least one qualifying order ever are counted — a
     * record created and never used is not a lapsed relationship, it is a
     * record created and never used.
     */
    public function dormantCustomerCount(int $days): int
    {
        $cutoff = CarbonImmutable::now()->subDays($days);

        return (int) DB::table('customers')
            ->whereNull('customers.deleted_at')
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('orders')
                    ->whereColumn('orders.customer_id', 'customers.id')
                    ->whereIn('orders.status', OrderStatus::qualifying());
            })
            ->whereNotExists(function ($query) use ($cutoff): void {
                $query->selectRaw('1')
                    ->from('orders')
                    ->whereColumn('orders.customer_id', 'customers.id')
                    ->whereIn('orders.status', OrderStatus::qualifying())
                    ->where('orders.placed_at', '>=', $cutoff);
            })
            ->count();
    }

    /**
     * Products at risk of running out: selling recently, and with fewer than
     * `$days` of cover left at that rate.
     *
     * @return list<array{product_id: int, name: string, sku: string, days: float, stock: int}>
     */
    public function stockoutRisks(int $days, int $trailingDays, int $limit): array
    {
        $trailing = Period::trailingDays($trailingDays);
        [$from, $to] = $trailing->utcBounds();

        /*
         * Candidates first, in ONE query: products that actually sold in the
         * window. Asking stockCoverageDays about every product in the catalogue
         * would be a query per product, and the answer is null for most of them
         * anyway — a product with no recent demand has no stockout risk,
         * however little of it is on the shelf.
         */
        $candidates = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('products', 'products.id', '=', 'order_items.product_id')
            ->join('inventory_items', 'inventory_items.product_id', '=', 'products.id')
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to)
            ->whereNull('products.deleted_at')
            ->where('products.is_active', true)
            ->groupBy('products.id', 'products.name', 'products.sku', 'inventory_items.stock_on_hand')
            ->havingRaw('SUM(order_items.quantity) > 0')
            ->selectRaw(
                'products.id AS product_id, products.name AS name, products.sku AS sku, '
                .'inventory_items.stock_on_hand AS stock, '
                .'SUM(order_items.quantity) AS units'
            )
            ->get();

        $risks = [];

        foreach ($candidates as $row) {
            $perDay = (int) $row->units / $trailingDays;

            if ($perDay <= 0.0) {
                continue;
            }

            $cover = (int) $row->stock / $perDay;

            if ($cover >= $days) {
                continue;
            }

            $risks[] = [
                'product_id' => (int) $row->product_id,
                'name' => (string) $row->name,
                'sku' => (string) $row->sku,
                'days' => round($cover, 1),
                'stock' => (int) $row->stock,
            ];
        }

        // Most urgent first — the one that runs out soonest is the one to act
        // on, and a reader acts on the top of a list.
        usort($risks, static fn (array $a, array $b): int => $a['days'] <=> $b['days']);

        return array_slice($risks, 0, $limit);
    }

    /* ---------------------------------------------------------------------- */
    /* Inventory */
    /* ---------------------------------------------------------------------- */

    /**
     * Active products at or below their reorder point.
     *
     * A POINT-IN-TIME figure: it reflects now, not the selected period, and the
     * UI labels it that way (METRICS.md §2.18).
     */
    public function lowStockCount(): int
    {
        return (int) DB::table('inventory_items')
            ->join('products', 'products.id', '=', 'inventory_items.product_id')
            ->whereNull('products.deleted_at')
            ->where('products.is_active', true)
            ->whereRaw('inventory_items.stock_on_hand <= COALESCE(products.low_stock_threshold, inventory_items.reorder_point)')
            ->count();
    }

    /**
     * Days of stock remaining at the recent sales rate.
     *
     * Ships INSTEAD of Inventory Turnover (ADR-014). Turnover needs average
     * inventory VALUE over the period, which needs historical valuation and a
     * costing method the MVP has not chosen. Approximating it with current stock
     * value produces a plausible-looking number that is wrong whenever stock
     * moved — which is always.
     *
     * Deliberately uses a fixed trailing 30 days regardless of the selected
     * period, because coverage is about the current burn rate. The label says so.
     *
     * Null when nothing sold recently: "infinite days of stock" is not a fact.
     */
    public function stockCoverageDays(int $productId, ?Period $trailing = null): ?float
    {
        $trailing ??= Period::preset('30d');
        [$from, $to] = $trailing->utcBounds();

        $units = (int) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.product_id', $productId)
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to)
            ->sum('order_items.quantity');

        if ($units === 0) {
            return null;
        }

        $onHand = (int) DB::table('inventory_items')
            ->where('product_id', $productId)
            ->value('stock_on_hand');

        return $onHand / ($units / $trailing->lengthInDays());
    }

    /* ---------------------------------------------------------------------- */
    /* Internals */
    /* ---------------------------------------------------------------------- */

    /**
     * Every order-level total for a period, in ONE query, memoised.
     *
     * WHY THIS EXISTS. The metric methods derive from each other — netMargin
     * calls netProfit, which calls grossProfit, which calls netRevenue — so a
     * naive implementation queried netRevenue six times per period and a single
     * dashboard summary issued 52 queries. Measured: 77ms for a 30-day summary,
     * 181ms over three years, essentially all of it SQL.
     *
     * That was the real cost, not the absence of a pre-aggregated rollup table.
     * Consolidating the queries removes it without introducing staleness or a
     * second definition of any metric, which is what a rollup would have cost
     * (ADR-009).
     *
     * Memoised per period for the life of the request. Safe because no request
     * both writes an order and then reports on it.
     *
     * @return object{gross: string, discounts: string, refunds: string, cogs: string, orders: int}
     */
    private function aggregate(Period $period): object
    {
        $key = $period->from.'|'.$period->to.'|'.$period->timezone;

        if (isset($this->aggregates[$key])) {
            return $this->aggregates[$key];
        }

        [$from, $to] = $period->utcBounds();

        $row = DB::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->where('placed_at', '>=', $from)
            ->where('placed_at', '<', $to)
            ->selectRaw(
                'COALESCE(SUM(subtotal_amount), 0) AS gross, '
                .'COALESCE(SUM(discount_amount), 0) AS discounts, '
                .'COALESCE(SUM(refunded_amount), 0) AS refunds, '
                .'COALESCE(SUM(cogs_amount), 0) AS cogs, '
                .'COUNT(*) AS orders'
            )
            ->first();

        // Money stays a string throughout; only the count becomes an int.
        return $this->aggregates[$key] = (object) [
            'gross' => (string) ($row->gross ?? '0.00'),
            'discounts' => (string) ($row->discounts ?? '0.00'),
            'refunds' => (string) ($row->refunds ?? '0.00'),
            'cogs' => (string) ($row->cogs ?? '0.00'),
            'orders' => (int) ($row->orders ?? 0),
        ];
    }
}
