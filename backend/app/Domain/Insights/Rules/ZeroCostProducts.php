<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Sold line items with no recorded cost — a DATA QUALITY warning, not a
 * business one.
 *
 * This rule exists because of the direction of the error. A line with
 * `unit_cost = 0` contributes its full revenue to gross profit and nothing to
 * COGS, so every margin covering it is overstated, silently, in the flattering
 * direction. Nobody investigates a margin that looks better than expected.
 *
 * The system therefore has to say so itself, and say it on the same screen as
 * the figure it is qualifying. A reporting tool that knows its own numbers are
 * inflated and does not mention it is worse than one that cannot tell.
 */
final class ZeroCostProducts extends Rule
{
    public function id(): string
    {
        return 'zero_cost_products';
    }

    public function severity(): string
    {
        return 'data_quality';
    }

    public function requiresCost(): bool
    {
        return true;
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $count = $context->calculator()->zeroCostItemCount($context->period);

        if ($count === 0) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: __('insights.zero_cost_products.title'),
            message: trans_choice('insights.zero_cost_products.message', $count, ['count' => $this->count($count)]),
            link: $context->link(['metric' => 'gross_profit']),
            values: ['count' => $count],
        );
    }
}
