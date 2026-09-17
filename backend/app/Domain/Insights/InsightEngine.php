<?php

declare(strict_types=1);

namespace App\Domain\Insights;

use App\Domain\Insights\Rules\CancellationSpike;
use App\Domain\Insights\Rules\CustomerConcentration;
use App\Domain\Insights\Rules\DormantCustomers;
use App\Domain\Insights\Rules\ExpenseSpike;
use App\Domain\Insights\Rules\LowStock;
use App\Domain\Insights\Rules\MarginDecline;
use App\Domain\Insights\Rules\RevenueDrop;
use App\Domain\Insights\Rules\RevenueSurge;
use App\Domain\Insights\Rules\StockoutRisk;
use App\Domain\Insights\Rules\ZeroCostProducts;
use App\Domain\Metrics\Breakdown;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\MetricSummary;
use App\Domain\Metrics\Period;
use App\Models\User;

/**
 * Runs the rule set and applies the three suppression guards.
 *
 * The guards are here, not in the rules, and that placement is the point: a
 * rule written next year cannot forget them, because it never sees the case.
 * Every rule that has ever been written by hand has eventually fired on a
 * two-order month or on the morning of the first, and the fix belongs once at
 * the gate rather than ten times inside.
 */
final class InsightEngine
{
    public function __construct(
        private readonly MetricSummary $metrics,
        private readonly Breakdown $breakdown,
        private readonly MetricCalculator $calculator,
    ) {}

    /**
     * The MVP rule set, in the order findings are presented.
     *
     * Ordered by what a reader should act on first — things that are wrong,
     * then things to do, then things that went well — rather than
     * alphabetically or by severity enum. The feed is read top-down and
     * usually only the first few lines are read at all.
     *
     * @return list<class-string<InsightRule>>
     */
    public static function rules(): array
    {
        return [
            MarginDecline::class,
            RevenueDrop::class,
            CancellationSpike::class,
            ExpenseSpike::class,
            CustomerConcentration::class,
            StockoutRisk::class,
            LowStock::class,
            ZeroCostProducts::class,
            DormantCustomers::class,
            RevenueSurge::class,
        ];
    }

    /**
     * @return list<Insight>
     */
    public function for(Period $period, Comparison $comparison, ?User $user): array
    {
        $context = new InsightContext(
            period: $period,
            comparison: $comparison,
            user: $user,
            metrics: $this->metrics,
            breakdown: $this->breakdown,
            calculator: $this->calculator,
        );

        $partial = $period->isPartial();
        $thin = $this->isThin($context);

        $insights = [];

        foreach (self::rules() as $class) {
            /** @var InsightRule $rule */
            $rule = app($class);

            if (! $this->shouldEvaluate($rule, $context, $partial, $thin)) {
                continue;
            }

            $insight = $rule->evaluate($context);

            if ($insight !== null) {
                $insights[] = $insight;
            }
        }

        return $insights;
    }

    /**
     * The three guards, in the order they matter.
     */
    private function shouldEvaluate(
        InsightRule $rule,
        InsightContext $context,
        bool $partial,
        bool $thin,
    ): bool {
        /*
         * 1. SECURITY. A cost-bearing rule is not evaluated for a cost-blind
         *    role, so the number never exists in this process. This guard is
         *    first because it is the only one whose failure is a breach rather
         *    than a nuisance.
         */
        if ($rule->requiresCost() && ! $context->canSeeCost()) {
            return false;
        }

        // Point-in-time rules describe now, so neither remaining guard applies.
        if ($rule->isPointInTime()) {
            return true;
        }

        /*
         * 2. PARTIAL PERIODS. "Revenue is down 94%" at 09:00 on the first of
         *    the month is arithmetically correct and operationally worthless:
         *    it compares nine hours against a whole month. Firing it trains
         *    the reader to ignore the feed on exactly the days they open it
         *    most often (METRICS.md §4).
         */
        if ($partial) {
            return false;
        }

        // 3. MINIMUM VOLUME. Percentage swings on a handful of orders.
        return ! $thin;
    }

    /**
     * Counts orders in BOTH periods.
     *
     * Ten orders this month against two last month still produces a 400% rise
     * off a sample too small to mean anything, so the thin period is whichever
     * side of the comparison is thinner. Checking only the current period
     * would let every rule fire on the month after a quiet one.
     */
    private function isThin(InsightContext $context): bool
    {
        $minimum = (int) config('insights.minimum_orders', 10);

        if ($this->calculator->ordersCount($context->period) < $minimum) {
            return true;
        }

        $previous = $context->previousPeriod();

        return $previous !== null && $this->calculator->ordersCount($previous) < $minimum;
    }
}
