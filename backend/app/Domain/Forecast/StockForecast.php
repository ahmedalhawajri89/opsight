<?php

declare(strict_types=1);

namespace App\Domain\Forecast;

use App\Domain\Orders\OrderStatus;
use App\Models\BusinessSetting;
use App\Support\Localization\LocalizedName;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;
use Carbon\CarbonImmutable;

/**
 * When each product runs out, and what to order before it does (phase D1).
 *
 * THE METHOD, SAID PLAINLY, because a forecast an owner cannot explain is one
 * they will not act on:
 *
 *  - Sales are counted in the last twelve full weeks, in the business's own
 *    calendar, from confirmed and fulfilled orders.
 *  - The selling rate is an exponentially weighted average of the last eight
 *    weeks: each week counts for more than the one before it, so a product
 *    that has started selling faster is noticed within a fortnight, and one
 *    unusual week does not swing the whole estimate.
 *  - Days of cover = stock ÷ daily rate. The order-by date is the run-out
 *    date less the supplier's lead time. The suggested quantity covers the
 *    lead time plus the chosen number of days, less what is on the shelf.
 *
 * AND IT SAYS HOW WRONG IT WAS. The same method is run as it would have been
 * four weeks ago, on the eight weeks before that, and its prediction for the
 * last four weeks is set against what actually sold. That error is published
 * beside the forecast (ROADMAP phase D): a number with its margin is one an
 * owner can trust, and one without is a guess in a suit.
 *
 * No seasonality yet. A forecast made in the week before Ramadan will be
 * too low for Ramadan; that is stated on the screen, not hidden.
 */
final class StockForecast
{
    /** Weeks the rate is drawn from. */
    private const RATE_WEEKS = 8;

    /** Weeks of history read: the rate's eight, plus four to test against. */
    private const HISTORY_WEEKS = 12;

    /** How much each newer week counts over the one before. */
    private const ALPHA = 0.3;

    /**
     * @return array{
     *     generated_for: string, lead_time_days: int, cover_days: int,
     *     accuracy: float|null, counts: array<string, int>,
     *     items: list<array<string, mixed>>
     * }
     */
    public function for(int $leadTime, int $coverDays, bool $withCost, ?CarbonImmutable $now = null): array
    {
        $timezone = BusinessSetting::current()->timezone ?: 'UTC';
        $today = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->startOfDay();
        $weeks = $this->weeklyUnits($today, $timezone);

        /** @var list<array<string, mixed>> $items */
        $items = [];
        $predicted = 0.0;
        $actual = 0.0;

        foreach ($this->products() as $product) {
            $history = $weeks[$product->product_id] ?? array_fill(0, self::HISTORY_WEEKS, 0);
            // Index 0 is the oldest week, 11 the most recent.
            $recent = array_slice($history, -self::RATE_WEEKS);

            /*
             * A product on an empty shelf sells nothing, and that is not a
             * fall in demand. Counting those weeks as zero would lower the
             * rate exactly when the product is most wanted, and suggest
             * reordering less of it. So while it is out of stock, the zero
             * weeks at the end of its history are left out of the rate —
             * the first demo product out of stock had its rate cut by a
             * third that way.
             */
            $forRate = $recent;

            if ((int) $product->stock_on_hand <= 0) {
                while ($forRate !== [] && end($forRate) === 0) {
                    array_pop($forRate);
                }
            }

            $weeklyRate = $this->ewma($forRate);
            $daily = $weeklyRate / 7;

            // The back-test: the rate as it stood four weeks ago, against what
            // the following four weeks actually sold.
            $then = $this->ewma(array_slice($history, 0, self::RATE_WEEKS));
            $sold = array_sum(array_slice($history, -4));

            if ($then > 0 || $sold > 0) {
                $predicted += abs($then * 4 - $sold);
                $actual += $sold;
            }

            if ($daily <= 0) {
                continue; // Not selling: no rate, no run-out, nothing to plan.
            }

            $stock = (int) $product->stock_on_hand;
            $daysLeft = max(0, $stock) / $daily;
            $runOut = $today->addDays((int) floor($daysLeft));
            $orderBy = $runOut->subDays($leadTime);
            $suggested = (int) max(0, ceil($daily * ($leadTime + $coverDays) - max(0, $stock)));

            $status = match (true) {
                $stock <= 0 => 'out',
                $orderBy->lessThanOrEqualTo($today) => 'order_now',
                $orderBy->lessThanOrEqualTo($today->addDays(7)) => 'soon',
                default => 'ok',
            };

            $items[] = [
                'product_id' => (int) $product->product_id,
                'name' => (string) LocalizedName::pick($product->name, $product->name_ar),
                'sku' => (string) $product->sku,
                'unit' => $product->unit,
                'stock' => $stock,
                'daily_rate' => round($daily, 2),
                'weekly_units' => array_map('intval', $recent),
                'days_left' => round($daysLeft, 1),
                'run_out_on' => $runOut->toDateString(),
                'order_by' => ($orderBy->lessThan($today) ? $today : $orderBy)->toDateString(),
                'suggested_quantity' => $suggested,
                'suggested_cost' => $withCost ? Money::round(bcmul((string) $product->cost, (string) $suggested, 4)) : null,
                'confidence' => $this->confidence($recent),
                'status' => $status,
            ];
        }

        // Most urgent first: out, then by the day an order must go in.
        $rank = ['out' => 0, 'order_now' => 1, 'soon' => 2, 'ok' => 3];
        $keys = array_map(
            static fn (array $item): string => $rank[(string) $item['status']].'|'.$item['order_by'].'|'.$item['name'],
            $items,
        );
        array_multisort($keys, SORT_STRING, $items);

        $counts = array_fill_keys(['out', 'order_now', 'soon', 'ok'], 0);

        foreach ($items as $item) {
            $counts[$item['status']]++;
        }

        return [
            'generated_for' => $today->toDateString(),
            'lead_time_days' => $leadTime,
            'cover_days' => $coverDays,
            // 1 − weighted absolute percentage error, floored at zero. Null
            // until four weeks have sold anything to be tested against.
            'accuracy' => $actual > 0 ? round(max(0.0, 1 - $predicted / $actual), 3) : null,
            'counts' => $counts,
            'items' => $items,
        ];
    }

    /**
     * Units sold per product per week, oldest week first, over the last
     * HISTORY_WEEKS full weeks ending yesterday in the business's calendar.
     *
     * @return array<int, list<int>>
     */
    private function weeklyUnits(CarbonImmutable $today, string $timezone): array
    {
        $start = $today->subDays(self::HISTORY_WEEKS * 7);
        $from = $start->utc()->toDateTimeString();
        $to = $today->utc()->toDateTimeString();

        $rows = TenantQuery::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to)
            ->whereNotNull('order_items.product_id')
            ->get(['order_items.product_id', 'orders.placed_at', 'order_items.quantity']);

        $weeks = [];

        foreach ($rows as $row) {
            // Bucketed in PHP, on the local date: a sale at 01:00 in Riyadh is
            // the previous day in UTC, and belongs to the local day.
            $local = CarbonImmutable::parse((string) $row->placed_at, 'UTC')->setTimezone($timezone)->startOfDay();
            $index = (int) floor($start->diffInDays($local) / 7);

            if ($index < 0 || $index >= self::HISTORY_WEEKS) {
                continue;
            }

            $weeks[(int) $row->product_id] ??= array_fill(0, self::HISTORY_WEEKS, 0);
            $weeks[(int) $row->product_id][$index] += (int) $row->quantity;
        }

        return $weeks;
    }

    /** @return iterable<object> */
    private function products(): iterable
    {
        return TenantQuery::table('inventory_items')
            ->join('products', 'products.id', '=', 'inventory_items.product_id')
            ->whereNull('products.deleted_at')
            ->where('products.is_active', true)
            ->get([
                'inventory_items.product_id', 'inventory_items.stock_on_hand',
                'products.name', 'products.name_ar', 'products.sku', 'products.unit', 'products.cost',
            ]);
    }

    /** @param list<int|float> $weeks oldest first */
    private function ewma(array $weeks): float
    {
        $average = null;

        foreach ($weeks as $units) {
            $average = $average === null ? (float) $units : self::ALPHA * $units + (1 - self::ALPHA) * $average;
        }

        return (float) ($average ?? 0.0);
    }

    /**
     * How far to trust the rate: steady sales in most weeks is high; a few
     * scattered sales, or weeks that swing wildly, is low.
     *
     * @param  list<int>  $weeks
     */
    private function confidence(array $weeks): string
    {
        $selling = count(array_filter($weeks, static fn (int $w): bool => $w > 0));

        if ($selling < 3) {
            return 'low';
        }

        $mean = array_sum($weeks) / count($weeks);
        $variance = array_sum(array_map(static fn (int $w): float => ($w - $mean) ** 2, $weeks)) / count($weeks);
        $cv = $mean > 0 ? sqrt($variance) / $mean : INF;

        return match (true) {
            $cv < 0.5 => 'high',
            $cv < 1.0 => 'medium',
            default => 'low',
        };
    }
}
