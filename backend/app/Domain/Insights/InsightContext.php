<?php

declare(strict_types=1);

namespace App\Domain\Insights;

use App\Domain\Metrics\Breakdown;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\MetricSummary;
use App\Domain\Metrics\MetricValue;
use App\Domain\Metrics\Period;
use App\Models\User;

/**
 * Everything the rules read, computed once and shared.
 *
 * Ten rules each asking the metric layer for net revenue would be ten
 * identical aggregate queries. Worse, they could DISAGREE — a rule that
 * computes its own revenue is a second definition of revenue, which is exactly
 * what the layered architecture exists to prevent (ARCHITECTURE.md §2).
 *
 * So the context is the only thing a rule touches. It reads L2 and nothing
 * below it, and every value is memoised: the first rule to ask pays for it and
 * the rest are free.
 */
final class InsightContext
{
    /** @var array<string, MetricValue>|null */
    private ?array $summary = null;

    /** @var array<string, array<string, mixed>> */
    private array $breakdowns = [];

    public function __construct(
        public readonly Period $period,
        public readonly Comparison $comparison,
        public readonly ?User $user,
        private readonly MetricSummary $metrics,
        private readonly Breakdown $breakdown,
        private readonly MetricCalculator $calculator,
    ) {}

    /**
     * The period this one is being compared against, or null if none was asked
     * for. A rule that needs a comparison and finds none does not fire —
     * "revenue fell 20%" against nothing is not a statement.
     */
    public function previousPeriod(): ?Period
    {
        return $this->period->comparison($this->comparison->value);
    }

    /**
     * @return array<string, MetricValue>
     */
    public function summary(): array
    {
        return $this->summary ??= $this->metrics->for($this->period, $this->comparison, $this->user);
    }

    public function metric(string $key): ?MetricValue
    {
        return $this->summary()[$key] ?? null;
    }

    /**
     * Cost-bearing metrics are ABSENT from the summary for a cost-blind role,
     * not null — so a rule reading one gets null here and does not fire. The
     * engine also refuses to run such a rule at all; this is the second layer,
     * and it exists because the two failures look identical from inside a rule
     * and only one of them is a bug.
     */
    public function canSeeCost(): bool
    {
        return $this->metrics->canSeeCost($this->user);
    }

    /**
     * @return array<string, mixed>
     */
    public function breakdown(string $dimension, string $metric = 'net_revenue', int $limit = 10): array
    {
        $key = $dimension.'|'.$metric.'|'.$limit;

        return $this->breakdowns[$key] ??= $this->breakdown->build(
            period: $this->period,
            dimension: $dimension,
            metric: $metric,
            user: $this->user,
            limit: $limit,
        );
    }

    public function calculator(): MetricCalculator
    {
        return $this->calculator;
    }

    /**
     * The link back to the evidence, with the period the insight was computed
     * for already applied — so the screen the reader lands on shows the same
     * figures the sentence quoted, not today's.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    public function link(array $extra = []): array
    {
        return array_merge([
            'preset' => 'custom',
            'from' => $this->period->from,
            'to' => $this->period->to,
            'comparison' => $this->comparison->value,
        ], $extra);
    }
}
