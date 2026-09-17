<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Net revenue fell materially against the comparison period.
 */
final class RevenueDrop extends Rule
{
    public function id(): string
    {
        return 'revenue_drop';
    }

    public function severity(): string
    {
        return 'warning';
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $revenue = $context->metric('net_revenue');

        /*
         * changePercent is null when the previous period was zero or the sign
         * flipped. Both are cases where a percentage would be arithmetic
         * theatre, so the rule stays silent rather than inventing one
         * (METRICS.md §1.5).
         */
        if ($revenue?->changePercent === null) {
            return null;
        }

        $threshold = (float) $this->config('drop_pct', 0.15);

        if ($revenue->changePercent > -$threshold) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: 'Net revenue is down',
            message: sprintf(
                'Net revenue fell %s%% against the %s.',
                $this->pct($revenue->changePercent),
                $context->comparison->label(),
            ),
            link: $context->link(['metric' => 'net_revenue']),
            values: ['change_pct' => round($revenue->changePercent, 4)],
        );
    }
}
