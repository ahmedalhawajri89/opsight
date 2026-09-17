<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * One customer accounts for an outsized share of revenue.
 *
 * Not a criticism of a good customer — a concentration risk. If a quarter of
 * revenue rests on one relationship, losing it is not a bad month, it is a
 * different business, and that is worth knowing before it happens rather than
 * after.
 */
final class CustomerConcentration extends Rule
{
    public function id(): string
    {
        return 'customer_concentration';
    }

    public function severity(): string
    {
        return 'warning';
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $rows = $context->breakdown('customer')['rows'] ?? [];

        $top = null;

        foreach ($rows as $row) {
            // "Other" is an aggregate of many customers, so its share is not a
            // concentration in any single one.
            if (($row['is_other'] ?? false) === true) {
                continue;
            }

            $top = $row;
            break;
        }

        // isset() is deliberate over array_key_exists: a null share means the
        // denominator was zero, and a share of nothing is not a concentration.
        if ($top === null || ! isset($top['share'])) {
            return null;
        }

        $share = (float) $top['share'];
        $threshold = (float) $this->config('share', 0.25);

        if ($share < $threshold) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: __('insights.customer_concentration.title'),
            message: __('insights.customer_concentration.message', [
                'customer' => (string) ($top['label'] ?? __('insights.customer_concentration.fallback_customer')),
                'pct' => $this->pct($share),
            ]),
            link: $context->link(['dimension' => 'customer']),
            values: ['customer' => $top['label'] ?? null, 'share' => round($share, 4)],
        );
    }
}
