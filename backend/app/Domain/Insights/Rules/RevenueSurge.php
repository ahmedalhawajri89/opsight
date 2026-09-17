<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Net revenue rose materially, and the largest category behind it.
 *
 * The only rule with a `positive` severity, and it earns its place: a feed
 * that reports exclusively bad news gets read as a complaints list and then
 * not read. Naming the leading category also makes the claim checkable, which
 * a bare "revenue is up" is not.
 */
final class RevenueSurge extends Rule
{
    public function id(): string
    {
        return 'revenue_surge';
    }

    public function severity(): string
    {
        return 'positive';
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $revenue = $context->metric('net_revenue');

        if ($revenue?->changePercent === null) {
            return null;
        }

        $threshold = (float) $this->config('rise_pct', 0.20);

        if ($revenue->changePercent < $threshold) {
            return null;
        }

        $top = $this->leadingCategory($context);

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: 'Net revenue is up',
            message: sprintf(
                'Net revenue rose %s%% against the %s%s.',
                $this->pct($revenue->changePercent),
                $context->comparison->label(),
                $top === null ? '' : ', led by '.$top,
            ),
            link: $context->link(['dimension' => 'category']),
            values: ['change_pct' => round($revenue->changePercent, 4), 'top_category' => $top],
        );
    }

    /**
     * The largest real category, skipping the synthetic "Other" bucket — which
     * is an aggregate of everything outside the top ten and would be a
     * meaningless thing to credit a rise to.
     */
    private function leadingCategory(InsightContext $context): ?string
    {
        $rows = $context->breakdown('category')['rows'] ?? [];

        foreach ($rows as $row) {
            if (($row['is_other'] ?? false) === true) {
                continue;
            }

            return isset($row['label']) ? (string) $row['label'] : null;
        }

        return null;
    }
}
