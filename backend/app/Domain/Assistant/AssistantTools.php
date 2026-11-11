<?php

declare(strict_types=1);

namespace App\Domain\Assistant;

use App\Authorization\Ability;
use App\Domain\Insights\InsightEngine;
use App\Domain\Inventory\StockLevel;
use App\Domain\Metrics\Breakdown;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\MetricSummary;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\TimeSeries;
use App\Models\BusinessSetting;
use App\Models\InventoryItem;
use App\Models\User;
use Carbon\CarbonImmutable;
use stdClass;
use Throwable;

/**
 * What Ask Baydar may look at, for one person (ADR-038).
 *
 * THE MODEL HAS NO ROUTE TO A FIGURE EXCEPT THESE. Each tool is a thin call
 * into a service the dashboard and the analytics screen already use, made as
 * the asking user, so every figure has the one tested definition it has on
 * those screens and the same role filtering.
 *
 * AND THE ROLE IS ENFORCED BY WHAT EXISTS, NOT BY WHAT IS ASKED. For someone
 * who may not see cost, the cost metrics are not in any tool's list of
 * allowed values. No phrasing can request them, because the option was never
 * offered. The services' own checks stay underneath as a second wall.
 */
final class AssistantTools
{
    /** The longest range a tool will answer, as the analytics API does. */
    private const MAX_DAYS = 1096;

    public function __construct(
        private readonly MetricSummary $summary,
        private readonly TimeSeries $timeSeries,
        private readonly Breakdown $breakdown,
        private readonly InsightEngine $insights,
        private readonly MetricCalculator $metrics,
    ) {}

    /**
     * The tool definitions this user is given. Deterministic for a role —
     * same order, same text — so the prompt cache holds across requests.
     *
     * @return list<array<string, mixed>>
     */
    public function definitionsFor(User $user): array
    {
        $cost = $this->summary->canSeeCost($user);

        $period = [
            'from' => ['type' => 'string', 'description' => 'First day, YYYY-MM-DD, in the business\'s own timezone.'],
            'to' => ['type' => 'string', 'description' => 'Last day, inclusive, YYYY-MM-DD.'],
        ];

        $compare = [
            'type' => 'string',
            'enum' => array_map(static fn (Comparison $c): string => $c->value, Comparison::cases()),
            'description' => 'What to compare against. previous_hijri_year compares the same Hijri season last year — use it for Ramadan and Eid.',
        ];

        $tools = [
            $this->tool(
                'get_summary',
                'Headline figures for a period, each with its comparison: revenue, orders, average order value, customers'
                .($cost ? ', cost of goods, gross profit and margin, operating expenses, net profit and margin' : '')
                .', refunds and cancellations.',
                $period + ['compare' => $compare],
            ),
            $this->tool(
                'get_trend',
                'One metric over a period, bucketed by day, week or month. Use it to say when something changed.',
                $period + [
                    'metric' => ['type' => 'string', 'enum' => $this->trendMetrics($cost)],
                    'grain' => ['type' => 'string', 'enum' => ['day', 'week', 'month']],
                ],
            ),
            $this->tool(
                'get_breakdown',
                'A metric ranked by product, category or customer for a period, with each row\'s share of the total.',
                $period + [
                    'dimension' => ['type' => 'string', 'enum' => Breakdown::DIMENSIONS],
                    'metric' => ['type' => 'string', 'enum' => $cost ? ['net_revenue', 'units_sold', 'cogs', 'gross_profit'] : ['net_revenue', 'units_sold']],
                    'limit' => ['type' => 'integer', 'description' => 'How many rows, 1 to 20.'],
                ],
            ),
            $this->tool(
                'get_insights',
                'The findings Baydar\'s rules raised for a period: revenue drops, margin declines, stock-out risks, expense spikes, dormant customers and more. Each is already a checked statement.',
                $period + ['compare' => $compare],
            ),
        ];

        if ($user->can(Ability::InventoryView->value)) {
            $tools[] = $this->tool(
                'get_stock_risks',
                'Products likely to run out soon at their recent selling rate, with days of stock left; counts of low and out-of-stock products; and, by name, every product at or below its reorder level.',
                ['within_days' => ['type' => 'integer', 'description' => 'Flag products with fewer than this many days of stock, 1 to 90.']],
            );
        }

        return $tools;
    }

    /**
     * Runs one tool call. Returns the result, or an error the model reads and
     * can correct — a bad date is the model's mistake to fix, not a failure.
     *
     * @param  array<string, mixed>  $input
     * @return array{result: array<string, mixed>, error: bool, source: array<string, mixed>}
     */
    public function run(User $user, string $name, array $input): array
    {
        $allowed = array_column($this->definitionsFor($user), 'name');

        if (! in_array($name, $allowed, true)) {
            // A tool this role was not given. Unreachable through the API's own
            // validation, and refused here regardless.
            return $this->error($name, $input, 'No such tool.');
        }

        try {
            $period = in_array($name, ['get_summary', 'get_trend', 'get_breakdown', 'get_insights'], true)
                ? $this->period($input)
                : null;

            $result = match ($name) {
                'get_summary' => [
                    'metrics' => array_map(
                        static fn ($metric): array => $metric->toArray(),
                        $this->summary->for($period, $this->comparison($input), $user),
                    ),
                ],
                'get_trend' => [
                    'grain' => $grain = TimeSeries::grainFor($period, $this->enum($input, 'grain', ['day', 'week', 'month'], null)),
                    'points' => $this->timeSeries->build(
                        $period,
                        (string) $this->enum($input, 'metric', $this->trendMetrics($this->summary->canSeeCost($user)), null, required: true),
                        $grain,
                        $user,
                    ),
                ],
                'get_breakdown' => $this->breakdown->build(
                    period: $period,
                    dimension: (string) $this->enum($input, 'dimension', Breakdown::DIMENSIONS, null, required: true),
                    metric: (string) $this->enum($input, 'metric', $this->summary->canSeeCost($user) ? ['net_revenue', 'units_sold', 'cogs', 'gross_profit'] : ['net_revenue', 'units_sold'], null, required: true),
                    user: $user,
                    limit: max(1, min(20, (int) ($input['limit'] ?? 10))),
                ),
                'get_insights' => ['insights' => $this->insights->for($period, $this->comparison($input), $user)],
                'get_stock_risks' => [
                    'at_risk' => $this->metrics->stockoutRisks(max(1, min(90, (int) ($input['within_days'] ?? 14))), 30, 20),
                    'status' => $this->metrics->inventoryStatus(),
                    /*
                     * The products behind the low and out counts, by name.
                     * Without them the first live test answered "two are out of
                     * stock, but the tool did not say which" — honest, and no
                     * use to an owner deciding what to reorder.
                     */
                    'low_or_out' => $this->lowOrOut(),
                ],
            };
        } catch (AssistantToolError $e) {
            return $this->error($name, $input, $e->getMessage());
        } catch (Throwable $e) {
            report($e);

            return $this->error($name, $input, 'This figure could not be read just now.');
        }

        return [
            'result' => ($period !== null ? ['period' => ['from' => $input['from'], 'to' => $input['to']]] : []) + $result,
            'error' => false,
            'source' => $this->source($name, $input),
        ];
    }

    /**
     * Products at or below their reorder level, through the same rule the
     * inventory screen's low-stock list uses (StockLevel::whereLow), so the
     * assistant and the screen can never disagree about what "low" means.
     *
     * @return list<array{name: string, sku: string, stock: int}>
     */
    private function lowOrOut(): array
    {
        return InventoryItem::query()
            ->with('product:id,name,sku')
            ->whereHas('product', fn ($q) => $q->whereNull('deleted_at')->where('is_active', true))
            ->tap(fn ($query) => StockLevel::whereLow($query))
            ->orderBy('stock_on_hand')
            ->limit(20)
            ->get()
            ->map(static fn (InventoryItem $item): array => [
                'name' => (string) $item->product?->name,
                'sku' => (string) $item->product?->sku,
                'stock' => (int) $item->stock_on_hand,
            ])
            ->all();
    }

    /** @return list<string> */
    private function trendMetrics(bool $cost): array
    {
        return array_values($cost ? TimeSeries::METRICS : array_diff(TimeSeries::METRICS, TimeSeries::COST_METRICS));
    }

    /** @param array<string, mixed> $input */
    private function period(array $input): Period
    {
        $from = is_string($input['from'] ?? null) ? $input['from'] : '';
        $to = is_string($input['to'] ?? null) ? $input['to'] : '';
        $timezone = BusinessSetting::current()->timezone;

        try {
            $start = CarbonImmutable::createFromFormat('!Y-m-d', $from, $timezone);
            $end = CarbonImmutable::createFromFormat('!Y-m-d', $to, $timezone);
        } catch (Throwable) {
            throw new AssistantToolError('from and to must be dates written YYYY-MM-DD.');
        }

        if ($start === null || $end === null || $start->format('Y-m-d') !== $from || $end->format('Y-m-d') !== $to) {
            throw new AssistantToolError('from and to must be real dates written YYYY-MM-DD.');
        }

        if ($start->isAfter($end)) {
            throw new AssistantToolError('from must not be after to.');
        }

        if ($start->diffInDays($end) + 1 > self::MAX_DAYS) {
            throw new AssistantToolError('A period may be at most three years long.');
        }

        return Period::between($from, $to, $timezone);
    }

    /** @param array<string, mixed> $input */
    private function comparison(array $input): Comparison
    {
        return Comparison::tryFrom((string) ($input['compare'] ?? '')) ?? Comparison::PreviousPeriod;
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  list<string>  $allowed
     */
    private function enum(array $input, string $key, array $allowed, ?string $default, bool $required = false): ?string
    {
        $value = $input[$key] ?? null;

        if ($value === null || $value === '') {
            if ($required) {
                throw new AssistantToolError("{$key} is required: one of ".implode(', ', $allowed).'.');
            }

            return $default;
        }

        if (! is_string($value) || ! in_array($value, $allowed, true)) {
            throw new AssistantToolError("{$key} must be one of ".implode(', ', $allowed).'.');
        }

        return $value;
    }

    /**
     * @param  array<string, array<string, mixed>>  $properties
     * @return array<string, mixed>
     */
    private function tool(string $name, string $description, array $properties): array
    {
        return [
            'name' => $name,
            'description' => $description,
            'inputSchema' => [
                'type' => 'object',
                'properties' => $properties === [] ? new stdClass : $properties,
                'required' => array_values(array_diff(array_keys($properties), ['compare', 'grain', 'limit', 'within_days'])),
                'additionalProperties' => false,
            ],
            'strict' => true,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function source(string $name, array $input): array
    {
        return ['tool' => $name] + array_intersect_key($input, array_flip(['from', 'to', 'compare', 'metric', 'dimension', 'grain', 'within_days']));
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{result: array<string, mixed>, error: bool, source: array<string, mixed>}
     */
    private function error(string $name, array $input, string $message): array
    {
        return ['result' => ['error' => $message], 'error' => true, 'source' => $this->source($name, $input)];
    }
}
