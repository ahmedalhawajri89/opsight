<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Calendar\HijriCalendar;
use App\Domain\Inventory\StockLevel;
use App\Domain\Metrics\Breakdown;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\MetricSummary;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\QuickStats;
use App\Domain\Metrics\TimeSeries;
use App\Domain\Tax\VatReport;
use App\Http\Controllers\Controller;
use App\Http\Resources\InventoryItemResource;
use App\Models\BusinessSetting;
use App\Models\InventoryItem;
use App\Models\User;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Analytics — the L2 layer over the API.
 *
 * Every response states its period, timezone, comparison basis and whether the
 * period is still accumulating, so a chart can never mislabel itself and a
 * figure can never be read as final when it is not (ARCHITECTURE.md §4).
 */
class AnalyticsController extends Controller
{
    public function __construct(
        private readonly MetricSummary $summary,
        private readonly TimeSeries $timeSeries,
        private readonly Breakdown $breakdown,
        private readonly MetricCalculator $metrics,
        private readonly QuickStats $quickStats,
    ) {}

    /** Every headline metric for a period, with its comparison. */
    public function summary(Request $request): JsonResponse
    {
        $this->authorizeAnalytics($request);

        [$period, $comparison] = $this->resolvePeriod($request);
        $user = $request->user();

        $values = $this->summary->for($period, $comparison, $user);

        return response()->json([
            'data' => array_map(
                fn ($metric): array => $metric->toArray(),
                $values,
            ),
            'meta' => $this->meta($period, $comparison),
        ]);
    }

    /**
     * VAT charged, refunded and due for the period (ADR-018). Operational,
     * not a filed return: output VAT only, from the confirm-time snapshots.
     */
    public function vat(Request $request, VatReport $report): JsonResponse
    {
        $this->authorizeAnalytics($request);

        [$period, $comparison] = $this->resolvePeriod($request);

        return response()->json([
            'data' => $report->for($period),
            'meta' => $this->meta($period, $comparison),
        ]);
    }

    public function timeseries(Request $request): JsonResponse
    {
        $this->authorizeAnalytics($request);

        $validated = $request->validate([
            'metric' => ['required', Rule::in(TimeSeries::METRICS)],
            'grain' => ['nullable', Rule::in(['day', 'week', 'month'])],
        ]);

        [$period, $comparison] = $this->resolvePeriod($request);
        $grain = TimeSeries::grainFor($period, $validated['grain'] ?? null);

        return response()->json([
            'data' => $this->timeSeries->build($period, $validated['metric'], $grain, $request->user()),
            'meta' => $this->meta($period, $comparison) + [
                'metric' => $validated['metric'],
                'grain' => $grain,
            ],
        ]);
    }

    public function breakdown(Request $request): JsonResponse
    {
        $this->authorizeAnalytics($request);

        $validated = $request->validate([
            'dimension' => ['required', Rule::in(Breakdown::DIMENSIONS)],
            'metric' => ['required', Rule::in(['net_revenue', 'units_sold', 'cogs', 'gross_profit'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        [$period, $comparison] = $this->resolvePeriod($request);

        $result = $this->breakdown->build(
            period: $period,
            dimension: $validated['dimension'],
            metric: $validated['metric'],
            user: $request->user(),
            limit: (int) ($validated['limit'] ?? 10),
        );

        return response()->json([
            'data' => $result['rows'],
            'meta' => $this->meta($period, $comparison) + [
                'dimension' => $result['dimension'],
                'metric' => $result['metric'],
                'total' => $result['total'],
            ],
        ]);
    }

    /**
     * The dashboard: a composition of L1 and L2, not a surface of its own.
     *
     * Returns a DIFFERENT SET OF KEYS per role — cost tiles are absent, not
     * null, for a cost-blind role. The client renders what it receives and must
     * not assume a fixed shape (ROLES_AND_PERMISSIONS.md §4).
     */
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! ($user?->can(Ability::DashboardView->value) ?? false)) {
            abort(403);
        }

        [$period, $comparison] = $this->resolvePeriod($request);

        $canSeeCost = $this->summary->canSeeCost($user);
        $grain = TimeSeries::grainFor($period);

        $payload = [
            'metrics' => array_map(
                fn ($metric): array => $metric->toArray(),
                $this->summary->for($period, $comparison, $user),
            ),
            'revenue_trend' => $this->timeSeries->build($period, 'net_revenue', $grain, $user),
            'orders_trend' => $this->timeSeries->build($period, 'orders_count', $grain, $user),
            'aov_trend' => $this->timeSeries->build($period, 'average_order_value', $grain, $user),
            'top_products' => $this->topProducts($period, $comparison, $user),
            'quick_stats' => $this->quickStats->for($period, $user),
            /*
             * Revenue by category, for the share-of-sales chart. Five named
             * categories and an Other row, so the slices sum to the whole.
             */
            'category_breakdown' => $this->breakdown->build(
                $period,
                'category',
                'net_revenue',
                $user,
                5,
            )['rows'],
            'low_stock' => [
                'count' => $this->metrics->lowStockCount(),
                'items' => InventoryItemResource::collection(
                    InventoryItem::query()
                        ->with('product')
                        ->whereHas('product', fn ($q) => $q->whereNull('deleted_at')->where('is_active', true))
                        ->tap(fn ($q) => StockLevel::whereLow($q))
                        ->orderBy('stock_on_hand')
                        ->limit(5)
                        ->get(),
                )->toArray($request),
            ],
            // Point in time, like low_stock: how the catalogue's stock is spread now.
            'inventory_status' => $this->metrics->inventoryStatus(),
        ];

        // Only computed, and only present, for a role that may see cost.
        if ($canSeeCost) {
            $payload['profit_trend'] = $this->timeSeries->build($period, 'gross_profit', $grain, $user);
            $payload['expenses_trend'] = $this->timeSeries->build($period, 'operating_expenses', $grain, $user);
            $payload['margin_trend'] = $this->timeSeries->build($period, 'gross_margin', $grain, $user);

            /*
             * Revenue against operating expenses, month by month over the last
             * six calendar months INCLUDING the current one — deliberately not
             * the selected period, which for the default 30 days would be one
             * bar. It states its own window in `cash_flow.period`, and the
             * current month is flagged partial like any other series.
             */
            $trailing = $this->trailingMonths(6);

            $payload['cash_flow'] = [
                'period' => $trailing->toArray(),
                'revenue' => $this->timeSeries->build($trailing, 'net_revenue', 'month', $user),
                'expenses' => $this->timeSeries->build($trailing, 'operating_expenses', 'month', $user),
            ];
        }

        return response()->json([
            'data' => $payload,
            'meta' => $this->meta($period, $comparison),
        ]);
    }

    /* ---------------------------------------------------------------------- */

    /**
     * The five best-selling products, each with its units and its trend.
     *
     * Ranked by net line revenue like the breakdown it comes from, then
     * enriched from two more breakdowns of the SAME definition — units over
     * the period, and revenue over the comparison period — joined on the
     * snapshot SKU the ranking groups by. A product that did not sell in the
     * comparison period has no trend (null), not an infinite one.
     *
     * @return array<int, array<string, mixed>>
     */
    private function topProducts(Period $period, Comparison $comparison, ?User $user): array
    {
        $rows = $this->breakdown->build($period, 'product', 'net_revenue', $user, 5)['rows'];

        $units = $this->keyed($this->breakdown->build($period, 'product', 'units_sold', $user, PHP_INT_MAX)['rows']);

        $previousPeriod = $period->comparison($comparison->value);
        $previous = $previousPeriod === null
            ? []
            : $this->keyed($this->breakdown->build($previousPeriod, 'product', 'net_revenue', $user, PHP_INT_MAX)['rows']);

        return array_map(function (array $row) use ($units, $previous): array {
            if ($row['is_other'] ?? false) {
                return $row;
            }

            $before = $previous[$row['key']] ?? null;

            return $row + [
                'units' => (int) ($units[$row['key']] ?? 0),
                'previous_value' => $before,
                'change_pct' => $before !== null && bccomp((string) $before, '0', Money::scale()) > 0
                    ? round((float) bcdiv(bcsub((string) $row['value'], (string) $before, Money::scale()), (string) $before, 10), 6)
                    : null,
            ];
        }, $rows);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<string, string>
     */
    private function keyed(array $rows): array
    {
        $keyed = [];

        foreach ($rows as $row) {
            if (! ($row['is_other'] ?? false)) {
                $keyed[(string) $row['key']] = (string) $row['value'];
            }
        }

        return $keyed;
    }

    /** The last `$months` calendar months, the current one included, to today. */
    private function trailingMonths(int $months): Period
    {
        $timezone = BusinessSetting::current()->timezone;
        $today = Carbon::now($timezone)->startOfDay();

        return Period::between(
            $today->clone()->startOfMonth()->subMonths($months - 1)->toDateString(),
            $today->toDateString(),
            $timezone,
        );
    }

    private function authorizeAnalytics(Request $request): void
    {
        if (! ($request->user()?->can(Ability::AnalyticsView->value) ?? false)) {
            abort(403);
        }
    }

    /**
     * @return array{0: Period, 1: Comparison}
     */
    private function resolvePeriod(Request $request): array
    {
        $validated = $request->validate([
            'preset' => ['nullable', Rule::in(['7d', '30d', '90d', '365d', 'mtd', 'qtd', 'ytd', 'custom'])],
            'from' => ['nullable', 'date_format:Y-m-d', 'required_if:preset,custom'],
            'to' => ['nullable', 'date_format:Y-m-d', 'required_if:preset,custom', 'after_or_equal:from'],
            'comparison' => ['nullable', Rule::in(array_column(Comparison::cases(), 'value'))],
        ]);

        $preset = $validated['preset'] ?? '30d';

        $period = $preset === 'custom'
            ? Period::between($validated['from'], $validated['to'])
            : Period::preset($preset);

        $comparison = Comparison::from($validated['comparison'] ?? Comparison::PreviousPeriod->value);

        return [$period, $comparison];
    }

    /**
     * @return array<string, mixed>
     */
    private function meta(Period $period, Comparison $comparison): array
    {
        $previous = $period->comparison($comparison->value);
        $settings = BusinessSetting::current();

        $seasons = HijriCalendar::seasonsBetween($period->from, $period->to);
        $previousSeasons = $previous !== null
            ? HijriCalendar::seasonsBetween($previous->from, $previous->to)
            : [];

        return [
            'period' => $period->toArray(),
            // Ramadan and the two Eids inside the period, clipped to it.
            'seasons' => $seasons,
            'comparison' => [
                'basis' => $comparison->value,
                'label' => $comparison->describe($period),
                'from' => $previous?->from,
                'to' => $previous?->to,
                'seasons' => $previousSeasons,
                /*
                 * The two periods hold different amounts of Ramadan or Eid, so
                 * a change between them is partly the calendar. The UI offers
                 * the Hijri comparison instead. Never raised against the
                 * Hijri basis itself, which is the fix.
                 */
                'season_mismatch' => $previous !== null
                    && $comparison !== Comparison::PreviousHijriYear
                    && self::seasonsDiffer($seasons, $previousSeasons),
                /*
                 * An incomplete current period compared against a complete
                 * prior one is flagged, so the UI can warn rather than let the
                 * reader conclude trade has collapsed on the 2nd of the month.
                 */
                'compares_partial_against_complete' => $period->isPartial() && $previous !== null,
            ],
            'currency' => $settings->currency,
            'currency_decimals' => $settings->currency_decimals,
            // So a daily chart can mark the business's days off (ADR-020).
            'weekend_days' => $settings->weekend_days ?? [],
            'week_starts_on' => (int) $settings->week_starts_on,
        ];
    }

    /**
     * Whether two periods hold materially different amounts of a season.
     *
     * Counted in days per season, not presence: March 2025 was all Ramadan and
     * March 2026 held nineteen days of it — both "contain Ramadan", and they
     * are nothing alike. Three days is the threshold because an Eid is three
     * to four days, and a one- or two-day drift in the calendar moves nothing.
     *
     * @param  list<array{key: string, from: string, to: string}>  $current
     * @param  list<array{key: string, from: string, to: string}>  $previous
     */
    private static function seasonsDiffer(array $current, array $previous): bool
    {
        $days = function (array $seasons): array {
            $totals = [];

            foreach ($seasons as $season) {
                $length = (int) Carbon::parse($season['from'])->diffInDays(Carbon::parse($season['to'])) + 1;
                $totals[$season['key']] = ($totals[$season['key']] ?? 0) + $length;
            }

            return $totals;
        };

        $a = $days($current);
        $b = $days($previous);

        foreach (array_unique([...array_keys($a), ...array_keys($b)]) as $key) {
            if (abs(($a[$key] ?? 0) - ($b[$key] ?? 0)) >= 3) {
                return true;
            }
        }

        return false;
    }
}
