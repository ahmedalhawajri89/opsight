<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Customers who once ordered and have not in a long time.
 *
 * Severity `opportunity`, not `warning`: nothing is broken, there is something
 * worth doing. The distinction is the reason severity is a set of kinds rather
 * than a red-to-green ramp — this belongs beside "revenue fell" on the feed
 * without being ranked against it.
 */
final class DormantCustomers extends Rule
{
    public function id(): string
    {
        return 'dormant_customers';
    }

    public function severity(): string
    {
        return 'opportunity';
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $days = (int) $this->config('days', 90);
        $minimum = (int) $this->config('minimum', 3);

        $count = $context->calculator()->dormantCustomerCount($days);

        if ($count < $minimum) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: 'Customers have gone quiet',
            message: sprintf(
                '%d customers who used to order have not placed one in %d days.',
                $count,
                $days,
            ),
            link: ['href' => '/customers'],
            values: ['count' => $count, 'days' => $days],
        );
    }
}
