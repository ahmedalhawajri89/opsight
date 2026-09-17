<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Active products at or below their reorder point.
 *
 * POINT-IN-TIME, so it survives both the partial-period and minimum-volume
 * guards. A warehouse below its reorder point is below it at 09:00 on the
 * first of the month, and a quiet month does not make the shelf less empty.
 */
final class LowStock extends Rule
{
    public function id(): string
    {
        return 'low_stock';
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
        $count = $context->calculator()->lowStockCount();

        if ($count === 0) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: 'Stock needs reordering',
            message: sprintf(
                '%d %s at or below the reorder point, as of now.',
                $count,
                $count === 1 ? 'product is' : 'products are',
            ),
            // Not a period link: this figure is about now, so sending the
            // reader to a dated analytics view would be sending them to a
            // screen that cannot show what the sentence said.
            link: ['href' => '/inventory', 'low_stock' => true],
            values: ['count' => $count],
        );
    }
}
