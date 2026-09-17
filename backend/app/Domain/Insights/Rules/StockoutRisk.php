<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Products that will run out within days at the current sales rate.
 *
 * Stronger than low stock, and different in kind: a product can sit above its
 * reorder point and still be four days from empty if it is selling fast, while
 * a slow-moving product below its reorder point may have a year of cover. This
 * rule reads the RATE; low stock reads the LEVEL.
 *
 * POINT-IN-TIME, for the same reason as low stock.
 */
final class StockoutRisk extends Rule
{
    public function id(): string
    {
        return 'stockout_risk';
    }

    public function severity(): string
    {
        return 'action';
    }

    public function isPointInTime(): bool
    {
        return true;
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $risks = $context->calculator()->stockoutRisks(
            days: (int) $this->config('days_of_cover', 7),
            trailingDays: (int) $this->config('trailing_days', 30),
            limit: (int) $this->config('max_products', 5),
        );

        if ($risks === []) {
            return null;
        }

        $first = $risks[0];

        $rest = count($risks) - 1;

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: 'Products may run out',
            message: sprintf(
                '%s has about %s days of stock left at its recent sales rate%s.',
                $first['name'],
                number_format($first['days'], 1),
                $rest > 0 ? sprintf(' (%d other %s close behind)', $rest, $rest === 1 ? 'product is' : 'products are') : '',
            ),
            link: ['href' => '/inventory'],
            values: ['products' => $risks],
        );
    }
}
