<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightEngine;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Http\Controllers\Controller;
use App\Support\Localization\Localizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule as ValidationRule;

/**
 * The insights feed (L3).
 *
 * Reads the analytics layer and nothing below it, so an insight can never
 * disagree with the screen it links to — they are the same numbers, computed
 * once (ARCHITECTURE.md §2).
 *
 * The response carries a `suppressed` block, and that is not decoration. An
 * empty feed has two completely different meanings — "nothing is wrong" and
 * "the rules were not allowed to run" — and a UI that renders both as blank
 * space is lying by omission in one of the two cases. The reader is told which
 * one they are looking at.
 */
class InsightController extends Controller
{
    public function __construct(
        private readonly InsightEngine $engine,
        private readonly MetricCalculator $calculator,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Insights are a reading of the analytics layer, so they require the
        // ability that gates it rather than an ability of their own.
        if ($user === null || ! $user->can(Ability::DashboardView->value)) {
            abort(403);
        }

        [$period, $comparison] = $this->resolvePeriod($request);

        $insights = $this->engine->for($period, $comparison, $user);

        return response()->json([
            'data' => array_map(
                static fn (Insight $insight): array => $insight->toArray(),
                $insights,
            ),
            'meta' => [
                'period' => $period->toArray(),
                'comparison' => [
                    'basis' => $comparison->value,
                    'label' => $comparison->describe($period),
                ],
                'suppressed' => $this->suppression($period, $comparison),
            ],
        ]);
    }

    /**
     * Why period-based rules did not run, if they did not.
     *
     * Both guards are reported even though the engine applies them silently,
     * because the person looking at an empty feed is entitled to know it was
     * deliberate. "This period is still in progress" is a useful sentence; a
     * blank panel is not, and a blank panel on the first of the month — when
     * the rolling thirty-day window always includes today — is the state most
     * readers will encounter most often.
     *
     * @return array{reason: string|null, message: string|null}
     */
    private function suppression(Period $period, Comparison $comparison): array
    {
        if ($period->isPartial()) {
            return [
                'reason' => 'partial_period',
                'message' => __('insights.suppressed.partial_period'),
            ];
        }

        $minimum = (int) config('insights.minimum_orders', 10);
        $orders = $this->calculator->ordersCount($period);
        $previousPeriod = $period->comparison($comparison->value);
        $previousOrders = $previousPeriod !== null
            ? $this->calculator->ordersCount($previousPeriod)
            : $minimum;

        if ($orders < $minimum || $previousOrders < $minimum) {
            return [
                'reason' => 'too_few_orders',
                'message' => __('insights.suppressed.too_few_orders', [
                    'minimum' => app(Localizer::class)->number($minimum),
                ]),
            ];
        }

        return ['reason' => null, 'message' => null];
    }

    /**
     * @return array{0: Period, 1: Comparison}
     */
    private function resolvePeriod(Request $request): array
    {
        $validated = $request->validate([
            'preset' => ['nullable', ValidationRule::in(['7d', '30d', '90d', '365d', 'mtd', 'qtd', 'ytd', 'custom'])],
            'from' => ['nullable', 'date_format:Y-m-d', 'required_if:preset,custom'],
            'to' => ['nullable', 'date_format:Y-m-d', 'required_if:preset,custom', 'after_or_equal:from'],
            'comparison' => ['nullable', ValidationRule::in(array_column(Comparison::cases(), 'value'))],
        ]);

        $preset = $validated['preset'] ?? '30d';

        $period = $preset === 'custom'
            ? Period::between($validated['from'], $validated['to'])
            : Period::preset($preset);

        return [
            $period,
            Comparison::from($validated['comparison'] ?? Comparison::PreviousPeriod->value),
        ];
    }
}
