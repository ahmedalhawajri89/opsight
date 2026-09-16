<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Metrics\Breakdown;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\MetricSummary;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\TimeSeries;
use App\Http\Controllers\Controller;
use App\Http\Resources\InventoryItemResource;
use App\Models\BusinessSetting;
use App\Models\InventoryItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

    public function timeseries(Request $request): JsonResponse
    {
        $this->authorizeAnalytics($request);

        $validated = $request->validate([
            'metric' => ['required', Rule::in([
                'net_revenue', 'gross_revenue', 'orders_count', 'cogs', 'gross_profit',
            ])],
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

        $payload = [
            'metrics' => array_map(
                fn ($metric): array => $metric->toArray(),
                $this->summary->for($period, $comparison, $user),
            ),
            'revenue_trend' => $this->timeSeries->build(
                $period,
                'net_revenue',
                TimeSeries::grainFor($period),
                $user,
            ),
            'top_products' => $this->breakdown->build(
                $period,
                'product',
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
                        ->whereColumn('stock_on_hand', '<=', 'reorder_point')
                        ->orderBy('stock_on_hand')
                        ->limit(5)
                        ->get(),
                )->toArray($request),
            ],
        ];

        // Only computed, and only present, for a role that may see cost.
        if ($canSeeCost) {
            $payload['profit_trend'] = $this->timeSeries->build(
                $period,
                'gross_profit',
                TimeSeries::grainFor($period),
                $user,
            );
        }

        return response()->json([
            'data' => $payload,
            'meta' => $this->meta($period, $comparison),
        ]);
    }

    /* ---------------------------------------------------------------------- */

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
            'preset' => ['nullable', Rule::in(['7d', '30d', '90d', 'mtd', 'qtd', 'ytd', 'custom'])],
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

        return [
            'period' => $period->toArray(),
            'comparison' => [
                'basis' => $comparison->value,
                'label' => $comparison->describe($period),
                'from' => $previous?->from,
                'to' => $previous?->to,
                /*
                 * An incomplete current period compared against a complete
                 * prior one is flagged, so the UI can warn rather than let the
                 * reader conclude trade has collapsed on the 2nd of the month.
                 */
                'compares_partial_against_complete' => $period->isPartial() && $previous !== null,
            ],
            'currency' => $settings->currency,
            'currency_decimals' => $settings->currency_decimals,
        ];
    }
}
