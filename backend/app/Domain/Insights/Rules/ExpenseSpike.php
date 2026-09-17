<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * An expense category rose sharply AND is material against revenue.
 *
 * Both conditions matter. A stationery budget doubling from 40 to 80 is a
 * 100% rise and is not news; rent rising 12% might be. Requiring the category
 * to be worth at least a few percent of revenue is what separates the two,
 * and it is why the threshold is a share of revenue rather than an absolute
 * figure that would need revising every time the business grows.
 *
 * Reads cost-adjacent financials, so it is not evaluated for a cost-blind
 * role — Staff hold no expense ability at all.
 */
final class ExpenseSpike extends Rule
{
    public function id(): string
    {
        return 'expense_spike';
    }

    public function severity(): string
    {
        return 'warning';
    }

    public function requiresCost(): bool
    {
        return true;
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $previousPeriod = $context->previousPeriod();

        if ($previousPeriod === null) {
            return null;
        }

        $calculator = $context->calculator();

        $revenue = (float) $calculator->netRevenue($context->period);

        if ($revenue <= 0.0) {
            return null;
        }

        $current = $calculator->operatingExpensesByCategory($context->period);
        $previous = $calculator->operatingExpensesByCategory($previousPeriod);

        $risePct = (float) $this->config('rise_pct', 0.40);
        $minShare = (float) $this->config('min_share_of_revenue', 0.05);

        $worst = null;

        foreach ($current as $category => $amount) {
            $now = (float) $amount;
            $before = (float) ($previous[$category] ?? 0.0);

            // No spending last period means no percentage rise to state. A
            // brand-new category is a different finding, and inventing
            // "infinity percent" for it would be worse than staying silent.
            if ($before <= 0.0) {
                continue;
            }

            $change = ($now - $before) / $before;

            if ($change < $risePct || ($now / $revenue) < $minShare) {
                continue;
            }

            if ($worst === null || $change > $worst['change']) {
                $worst = ['category' => $category, 'change' => $change, 'amount' => $now];
            }
        }

        if ($worst === null) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: __('insights.expense_spike.title'),
            message: __('insights.expense_spike.message', [
                'category' => $worst['category'],
                'pct' => $this->pct($worst['change']),
                'basis' => $this->basis($context),
                'share' => $this->pct($worst['amount'] / $revenue),
            ]),
            link: $context->link(['href' => '/expenses']),
            values: [
                'category' => $worst['category'],
                'change_pct' => round($worst['change'], 4),
                'share_of_revenue' => round($worst['amount'] / $revenue, 4),
            ],
        );
    }
}
